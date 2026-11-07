/**
 * Gallery 3D viewer: glb / gltf / vrm / ply (mesh, point cloud, Gaussian splat) / spz.
 *
 * three.js is loaded the first time a 3D file is shown (static/lib/three-viewer).
 * The server has no 3D renderer, so thumbnails are rendered here and uploaded
 * (see ensureModelThumb); until then /thumb returns 404 and the card shows a placeholder.
 */
import { t } from "./i18n.js";

const LIB_URL = "/wfm_static/lib/three-viewer/three-viewer.js";
const DRACO_PATH = "/wfm_static/lib/three-viewer/draco/";
// Sentinel base for relative URIs in .gltf files; rewritten to the asset route on load.
const ASSET_BASE = "/__wfm3d__/";
const BACKGROUND = 0x181c26;
const THUMB_SIZE = 512;
const THUMB_TIMEOUT_MS = 60_000;
// Larger files only get a thumbnail when opened, not while scrolling the grid.
const AUTO_THUMB_MAX_BYTES = 128 * 1024 * 1024;
// Splats are sorted asynchronously and spring bones settle over time, so keep drawing
// for a while after each change instead of only once.
const SETTLE_FRAMES = 60;

const MODEL3D_EXTENSIONS = [".glb", ".gltf", ".vrm", ".ply", ".spz"];

export function isModel3dFile(img) {
    const source = (img?.ext || img?.filename || img?.path || "").toLowerCase();
    return MODEL3D_EXTENSIONS.some((ext) => source.endsWith(ext));
}

export function model3dExtLabel(img) {
    const source = (img?.ext || img?.filename || img?.path || "").toLowerCase();
    return (MODEL3D_EXTENSIONS.find((ext) => source.endsWith(ext)) || "").slice(1).toUpperCase();
}

let _libPromise = null;
function loadLib() {
    if (!_libPromise) {
        _libPromise = import(LIB_URL).catch((e) => {
            _libPromise = null;
            throw e;
        });
    }
    return _libPromise;
}

const serveUrl = (path) => `/wfm/gallery/image/serve?path=${encodeURIComponent(path)}`;
const assetUrl = (path, uri) => `/wfm/gallery/model3d/asset?path=${encodeURIComponent(path)}&uri=${encodeURIComponent(uri)}`;

async function fetchBytes(url, signal, onProgress) {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get("Content-Length")) || 0;
    if (!total || !res.body || !onProgress) return res.arrayBuffer();
    const out = new Uint8Array(total);
    const reader = res.body.getReader();
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out.set(value, received);
        received += value.length;
        onProgress(received / total);
    }
    return out.buffer.slice(0, received);
}

// 3DGS exports are .ply too; they are told apart by their per-splat properties.
function isSplatPly(buffer) {
    const head = new TextDecoder("latin1").decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 8192)));
    const end = head.indexOf("end_header");
    const header = end >= 0 ? head.slice(0, end) : head;
    return /property\s+\w+\s+f_dc_0\b/.test(header) || /property\s+\w+\s+scale_0\b/.test(header);
}

function countGeometry(root) {
    let vertices = 0;
    let triangles = 0;
    root.traverse((o) => {
        const g = o.geometry;
        if (!g?.attributes?.position) return;
        vertices += g.attributes.position.count;
        if (o.isMesh) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    });
    return { vertices, triangles: Math.round(triangles) };
}

async function loadGltf(lib, img, buffer, isVrm) {
    const manager = new lib.THREE.LoadingManager();
    manager.setURLModifier((url) => (url.startsWith(ASSET_BASE) ? assetUrl(img.path, url.slice(ASSET_BASE.length)) : url));
    const loader = new lib.GLTFLoader(manager);
    const draco = new lib.DRACOLoader(manager).setDecoderPath(DRACO_PATH);
    loader.setDRACOLoader(draco);
    loader.setMeshoptDecoder(lib.MeshoptDecoder);
    if (isVrm) loader.register((parser) => new lib.VRMLoaderPlugin(parser));
    let gltf;
    try {
        gltf = await loader.parseAsync(buffer, ASSET_BASE);
    } finally {
        draco.dispose();
    }

    const vrm = gltf.userData?.vrm;
    if (vrm) lib.VRMUtils.rotateVRM0(vrm);  // VRM 0.x faces -Z
    const object = vrm ? vrm.scene : gltf.scene;
    const mixer = gltf.animations?.length ? new lib.THREE.AnimationMixer(object) : null;
    if (mixer) mixer.clipAction(gltf.animations[0]).play();
    return {
        object,
        animated: !!mixer,
        settles: !!vrm,
        update: (dt) => { mixer?.update(dt); vrm?.update(dt); },
        stats: countGeometry(object),
    };
}

function loadPlyGeometry(lib, buffer) {
    const { THREE } = lib;
    const geometry = new lib.PLYLoader().parse(buffer);
    // "property double" (e.g. Open3D) comes back as a Float64Array, which WebGL rejects.
    for (const [name, attr] of Object.entries(geometry.attributes)) {
        if (attr.array instanceof Float64Array) {
            geometry.setAttribute(name, new THREE.BufferAttribute(Float32Array.from(attr.array), attr.itemSize, attr.normalized));
        }
    }
    const hasColor = !!geometry.attributes.color;
    if (!geometry.index) {
        geometry.computeBoundingSphere();
        const material = new THREE.PointsMaterial({
            size: geometry.boundingSphere.radius / 300,
            vertexColors: hasColor,
            color: hasColor ? 0xffffff : 0xb8c0cc,
        });
        const object = new THREE.Points(geometry, material);
        return { object, stats: countGeometry(object) };
    }
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
        vertexColors: hasColor,
        color: hasColor ? 0xffffff : 0xb8c0cc,
        roughness: 0.7,
        side: THREE.DoubleSide,
    });
    const object = new THREE.Mesh(geometry, material);
    return { object, stats: countGeometry(object) };
}

async function loadSplat(lib, stage, img, buffer) {
    const { SparkRenderer, SplatMesh } = await lib.loadSpark();
    const spark = new SparkRenderer({ renderer: stage.renderer });
    stage.scene.add(spark);
    const mesh = new SplatMesh({ fileBytes: new Uint8Array(buffer), fileName: img.filename || img.path });
    await mesh.initialized;
    mesh.quaternion.set(1, 0, 0, 0);  // splats are stored Y-down
    return {
        object: mesh,
        splat: true,
        settles: true,
        box: mesh.getBoundingBox(true),
        stats: { splats: mesh.packedSplats?.numSplats ?? mesh.numSplats ?? 0 },
        dispose: () => { mesh.dispose(); spark.dispose(); },
    };
}

async function loadInto(lib, stage, img, signal, onProgress) {
    const buffer = await fetchBytes(serveUrl(img.path), signal, onProgress);
    const name = (img.filename || img.path).toLowerCase();
    if (name.endsWith(".spz")) return loadSplat(lib, stage, img, buffer);
    if (name.endsWith(".ply")) {
        return isSplatPly(buffer) ? loadSplat(lib, stage, img, buffer) : loadPlyGeometry(lib, buffer);
    }
    return loadGltf(lib, img, buffer, name.endsWith(".vrm"));
}

function createStage(lib, canvas) {
    const { THREE } = lib;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(BACKGROUND);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new lib.RoomEnvironment(), 0.04);
    pmrem.dispose();
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.8;
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
    return { renderer, scene, camera, envTarget };
}

function frameObject(lib, stage, model) {
    const { THREE } = lib;
    const { camera, scene } = stage;
    scene.add(model.object);
    model.object.updateMatrixWorld(true);
    const box = model.box
        ? model.box.clone().applyMatrix4(model.object.matrixWorld)
        : new THREE.Box3().setFromObject(model.object);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, -1), new THREE.Vector3(1, 1, 1));
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-4);
    const distance = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.05;
    camera.near = distance / 500;
    camera.far = distance * 50;
    camera.position.copy(center).add(new THREE.Vector3(0.35, 0.2, 1).normalize().multiplyScalar(distance));
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    return center;
}

function disposeStage(stage, model) {
    try { model?.dispose?.(); } catch { /* already gone */ }
    model?.object?.traverse?.((o) => {
        o.geometry?.dispose?.();
        for (const m of [].concat(o.material || [])) {
            for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
            m.dispose?.();
        }
    });
    stage.envTarget.dispose();
    stage.renderer.dispose();
    stage.renderer.forceContextLoss();  // browsers only allow ~16 live contexts
}

function formatStats(stats) {
    const n = (v) => Number(v).toLocaleString();
    if (stats.splats != null) return t("gallery3dStatsSplats", n(stats.splats));
    if (!stats.triangles) return t("gallery3dStatsPoints", n(stats.vertices));
    return t("gallery3dStatsMesh", n(stats.vertices), n(stats.triangles));
}

// Center-crop the canvas to a square JPEG. Must run right after render() in the same task,
// because the drawing buffer is not preserved.
function captureJpeg(canvas) {
    const out = document.createElement("canvas");
    out.width = out.height = THUMB_SIZE;
    const side = Math.min(canvas.width, canvas.height);
    out.getContext("2d").drawImage(
        canvas, (canvas.width - side) / 2, (canvas.height - side) / 2, side, side, 0, 0, THUMB_SIZE, THUMB_SIZE,
    );
    return out.toDataURL("image/jpeg", 0.85);
}

async function uploadThumb(path, image) {
    const res = await fetch("/wfm/gallery/image/thumb3d", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, image }),
    });
    return res.ok;
}

/**
 * Interactive viewer inside `container`. It disposes itself once `container` leaves the
 * DOM, so callers can simply replace or remove the element.
 * `onReady(capture)` fires after the model is drawn; capture() returns a thumbnail data URL.
 */
export function mountModelViewer(container, img, { onReady } = {}) {
    container.classList.add("wfm-g3d");
    container.innerHTML = `
        <canvas class="wfm-g3d-canvas"></canvas>
        <div class="wfm-g3d-status">${t("gallery3dLoading")}</div>
        <div class="wfm-g3d-stats"></div>
        <button type="button" class="wfm-g3d-reset" title="${t("gallery3dResetView")}">⟲</button>`;
    const canvas = container.querySelector(".wfm-g3d-canvas");
    const status = container.querySelector(".wfm-g3d-status");
    const statsEl = container.querySelector(".wfm-g3d-stats");
    const resetBtn = container.querySelector(".wfm-g3d-reset");
    const abort = new AbortController();
    let stage = null;
    let model = null;
    let controls = null;
    let resizeObserver = null;
    let frameId = 0;
    let closed = false;

    const close = () => {
        if (closed) return;
        closed = true;
        abort.abort();
        cancelAnimationFrame(frameId);
        resizeObserver?.disconnect();
        controls?.dispose();
        if (stage) disposeStage(stage, model);
    };

    const fail = (e) => {
        if (closed || e?.name === "AbortError") return;
        console.error("[WFS] 3D viewer:", img.path, e);
        status.textContent = t("gallery3dLoadFailed");
        status.classList.add("wfm-g3d-status--error");
        status.style.display = "";
        close();
    };

    (async () => {
        const lib = await loadLib();
        if (closed) return;
        stage = createStage(lib, canvas);
        const { renderer, scene, camera } = stage;
        model = await loadInto(lib, stage, img, abort.signal, (p) => {
            status.textContent = `${t("gallery3dLoading")} ${Math.round(p * 100)}%`;
        });
        if (closed) {
            disposeStage(stage, model);
            return;
        }
        const center = frameObject(lib, stage, model);
        const home = camera.position.clone();
        controls = new lib.OrbitControls(camera, canvas);
        controls.target.copy(center);
        controls.enableDamping = true;
        controls.update();

        let dirty = SETTLE_FRAMES;
        const invalidate = () => { dirty = SETTLE_FRAMES; };
        controls.addEventListener("change", invalidate);
        resetBtn.addEventListener("click", () => {
            camera.position.copy(home);
            controls.target.copy(center);
            controls.update();
            invalidate();
        });
        const resize = () => {
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (!w || !h) return;
            renderer.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            invalidate();
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        renderer.render(scene, camera);  // surface a model that cannot be drawn as a load failure
        status.style.display = "none";
        statsEl.textContent = formatStats(model.stats);
        onReady?.(() => {
            renderer.render(scene, camera);
            return captureJpeg(canvas);
        });

        let last = performance.now();
        const tick = () => {
            if (!container.isConnected) {
                close();
                return;
            }
            frameId = requestAnimationFrame(tick);
            const now = performance.now();
            const dt = (now - last) / 1000;
            last = now;
            if (!container.clientWidth) return;  // hidden tab
            controls.update();
            if (!model.animated && dirty <= 0) return;
            dirty -= 1;
            try {
                model.update?.(dt);
                renderer.render(scene, camera);
            } catch (e) {
                fail(e);
            }
        };
        tick();
    })().catch(fail);

    return { close };
}

async function renderThumb(img) {
    const lib = await loadLib();
    const canvas = document.createElement("canvas");
    const stage = createStage(lib, canvas);
    stage.renderer.setPixelRatio(1);
    stage.renderer.setSize(THUMB_SIZE, THUMB_SIZE, false);
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), THUMB_TIMEOUT_MS);
    let model = null;
    try {
        model = await loadInto(lib, stage, img, abort.signal);
        frameObject(lib, stage, model);
        model.update?.(0);
        for (let i = 0; model.splat && i < SETTLE_FRAMES; i++) {
            stage.renderer.render(stage.scene, stage.camera);
            await new Promise((r) => requestAnimationFrame(r));
        }
        stage.renderer.render(stage.scene, stage.camera);
        return captureJpeg(canvas);
    } finally {
        clearTimeout(timer);
        disposeStage(stage, model);
    }
}

const _thumbJobs = new Map();  // path -> Promise<boolean>, also remembers failures for this session
let _thumbQueue = Promise.resolve();

/**
 * Render and store the thumbnail of a 3D file, one file at a time.
 * `isWanted()` is checked when the job's turn comes, so cards scrolled away or replaced by
 * a folder change cost nothing. Resolves true once the server has the thumbnail.
 */
export function ensureModelThumb(img, isWanted = () => true) {
    if (_thumbJobs.has(img.path)) return _thumbJobs.get(img.path);
    if (img.size > AUTO_THUMB_MAX_BYTES) return Promise.resolve(false);
    const job = _thumbQueue.then(async () => {
        if (!isWanted()) {
            _thumbJobs.delete(img.path);
            return false;
        }
        try {
            return await uploadThumb(img.path, await renderThumb(img));
        } catch (e) {
            console.warn("[WFS] 3D thumbnail failed:", img.path, e);
            return false;
        }
    });
    _thumbJobs.set(img.path, job);
    _thumbQueue = job;
    return job;
}

/** Store a thumbnail captured from an open viewer (covers files too large for ensureModelThumb). */
export function saveModelThumb(img, capture) {
    const job = uploadThumb(img.path, capture()).catch(() => false);
    _thumbJobs.set(img.path, job);
    return job;
}
