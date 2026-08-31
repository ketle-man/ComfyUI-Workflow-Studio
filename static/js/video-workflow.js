/**
 * Video workflow helpers — model-family detection and node manipulation for
 * MiniMax H3 / LTX-2.5 (Text・Image・First&Last-Frame to Video) / Wan2.2 (Text
 * to Video) workflows. Pure functions operating on UI-format workflow JSON,
 * with no DOM/state dependency, so both the Plan tab's per-block batch loop
 * and (previously) the single-shot form can share the exact same logic.
 */

// ============================================
// 動画モデルノードの動的特定（ノードIDをハードコードしない）
// サブグラフの内部ノード型（Wan2.2のみサブグラフ名）で対象ワークフローの種類を判定し、
// 以降はサブグラフが公開する入力のlabel（無ければname）で意味的にスロットを特定する。
// これによりLTX-2.5の3バリアント間で公開入力のname（text/value/value_1...）が揺れて
// いても、label（prompt/duration/width...）は共通しているため同じロジックで処理できる。
// ============================================

// ノードのinputs[]のうちwidgetキーを持つものだけを抽出した並び順で、指定した入力定義の
// インデックスを引く。widgets_values配列はこの並び順と1:1対応する（link接続されていても
// widgetキーを持つ入力はwidgets_valuesにスロットを持つ「legacy full」形式のため）。
function _widgetIndexOf(node, inputDef) {
    if (!inputDef) return -1;
    const widgetInputs = (node?.inputs || []).filter((inp) => inp.widget);
    return widgetInputs.indexOf(inputDef);
}

// 上と同じ並び順ルールで、名前から直接インデックスを引く版（ResolutionSelectorや
// LoadImageなど、モデルファミリー間で入力名が揺れないノードに使う）。
export function widgetIndex(node, name) {
    const widgetInputs = (node?.inputs || []).filter((inp) => inp.widget);
    return widgetInputs.findIndex((inp) => inp.name === name);
}

// サブグラフが公開する入力は、labelがあればlabel、無ければnameが意味的な役割を表す
// （例: MiniMax H3の"width"はlabel無しでname自体が"width"、LTX-2.5の"value_2"はlabelが
// "width"）。
function _findInputByLabel(node, label) {
    return (node?.inputs || []).find((inp) => (inp.label || inp.name) === label) || null;
}

// noise_seedはLTX-2.5のText to Videoバリアントだけlabel="seed"を持つ(他は無label)ため、
// 意味的ラベルではなくname自体（全バリアントで"noise_seed"に統一）で検索する。
function _findInputByName(node, name) {
    return (node?.inputs || []).find((inp) => inp.name === name) || null;
}

function _detectVideoSubgraph(workflow) {
    if (!Array.isArray(workflow?.nodes) || !Array.isArray(workflow?.links)) return null;
    const subgraphs = workflow.definitions?.subgraphs || [];

    const minimax = subgraphs.find((sg) => (sg.nodes || []).some((n) => n.type === "MiniMaxH3ImageToVideo"));
    if (minimax) return { family: "minimax", sgDef: minimax };

    // LTX-2.5のText/Image/First&Last-Frame to Videoはいずれも内部にLTXV*系ノードを持つ
    // サブグラフとして配布される。バリアントごとにサブグラフの公開入力nameが異なるため、
    // 内部ノード型のプレフィックスで検出する。
    const ltx = subgraphs.find((sg) => (sg.nodes || []).some((n) => typeof n.type === "string" && n.type.startsWith("LTXV")));
    if (ltx) return { family: "ltx25", sgDef: ltx };

    // Wan2.2はUNETLoader/KSamplerAdvanced/EmptyHunyuanLatentVideoなど汎用ノードのみで
    // 構成されており、MiniMax H3/LTX-2.5のような固有ノード型による検出ができない。
    // そのためサブグラフ自体の名前（公式テンプレート由来の "...(Wan2.2)" 表記）で検出する。
    const wan22 = subgraphs.find((sg) => /wan\s*2\.2/i.test(sg.name || ""));
    if (wan22) return { family: "wan22", sgDef: wan22 };

    return null;
}

export function locateVideoModelNodes(workflow) {
    const detected = _detectVideoSubgraph(workflow);
    if (!detected) return null;
    const { family, sgDef } = detected;

    const instanceNode = workflow.nodes.find((n) => n.type === sgDef.id);
    if (!instanceNode || !Array.isArray(instanceNode.widgets_values)) return null;

    // Wan2.2の公開入力はプロンプトが label 無しの name="text" のまま(MiniMax H3の"prompt"や
    // LTX-2.5の label="prompt" と異なる)ため、"prompt" が見つからない場合は "text" にフォール
    // バックする。
    const promptInput = _findInputByLabel(instanceNode, "prompt") || _findInputByLabel(instanceNode, "text");
    const durationInput = _findInputByLabel(instanceNode, "duration");
    const widthInput = _findInputByLabel(instanceNode, "width");
    if (!promptInput || !durationInput || !widthInput) return null;

    const promptIdx = _widgetIndexOf(instanceNode, promptInput);
    const durationIdx = _widgetIndexOf(instanceNode, durationInput);
    if (promptIdx === -1 || durationIdx === -1) return null;

    const widthSlot = instanceNode.inputs.indexOf(widthInput);

    // ワークフローにより有無・意味が異なる任意項目。見つからなければ全て-1を返し、
    // 呼び出し側(UI)はその項目を無効化・非ハイライトにする。
    const heightInput = _findInputByLabel(instanceNode, "height");
    const noiseSeedInput = _findInputByName(instanceNode, "noise_seed");
    // MiniMax H3は"turbo_mode"、Wan2.2は"enable_turbo_mode" — 同じ意味のトグルをUI上は
    // 1つのフィールドとして兼用するため、どちらか見つかった方を使う。
    const turboModeInput = _findInputByLabel(instanceNode, "turbo_mode") || _findInputByLabel(instanceNode, "enable_turbo_mode");
    const turboStrengthInput = _findInputByLabel(instanceNode, "turbo_model_strength");
    const turboStepsInput = _findInputByLabel(instanceNode, "turbo_steps");
    const promptEnhanceInput = _findInputByLabel(instanceNode, "prompt_enhance");
    const noiseSeedIdx = _widgetIndexOf(instanceNode, noiseSeedInput);
    const turboModeIdx = _widgetIndexOf(instanceNode, turboModeInput);
    const turboStrengthIdx = _widgetIndexOf(instanceNode, turboStrengthInput);
    const turboStepsIdx = _widgetIndexOf(instanceNode, turboStepsInput);
    const promptEnhanceIdx = _widgetIndexOf(instanceNode, promptEnhanceInput);

    const findLinkedNode = (targetSlot) => {
        if (targetSlot === -1) return null;
        const link = workflow.links.find((l) => l[3] === instanceNode.id && l[4] === targetSlot);
        if (!link) return null;
        return workflow.nodes.find((n) => n.id === link[1]) || null;
    };

    // 一部のLTX-2.5バリアント(First & Last Frame to Video等)はResolutionSelectorを介さず、
    // width/heightをサブグラフの直接ウィジェット値として持つ。その場合はresolutionNode: null
    // を返し、以降の処理ではaspect_ratio等の操作をスキップする(テンプレートのwidth/height値が
    // そのまま使われる)。
    const rawResolutionNode = findLinkedNode(widthSlot);
    const resolutionNode = (rawResolutionNode && rawResolutionNode.type === "ResolutionSelector") ? rawResolutionNode : null;

    // first_frame/last_frameはoptional入力のため、対応するLoadImageノードが接続されて
    // いないワークフロー(テキストのみで動作するT2V構成など)もサポート対象とする。
    // 未接続の場合はnullのまま返し、必要ならapplyBlockToWorkflow側で動的にノードを注入する。
    const firstFrameInput = _findInputByLabel(instanceNode, "first_frame");
    const lastFrameInput = _findInputByLabel(instanceNode, "last_frame");
    const firstFrameSlot = firstFrameInput ? instanceNode.inputs.indexOf(firstFrameInput) : -1;
    const lastFrameSlot = lastFrameInput ? instanceNode.inputs.indexOf(lastFrameInput) : -1;

    const rawLoadImageNode = findLinkedNode(firstFrameSlot);
    const loadImageNode = (rawLoadImageNode && rawLoadImageNode.type === "LoadImage") ? rawLoadImageNode : null;
    const rawLastLoadImageNode = findLinkedNode(lastFrameSlot);
    const lastLoadImageNode = (rawLastLoadImageNode && rawLastLoadImageNode.type === "LoadImage") ? rawLastLoadImageNode : null;

    // width/heightはResolutionSelectorがあればその出力に接続されており(widthSlotの
    // link経由)、その場合は直接ウィジェット値を書き換えても実行時にリンク元の出力で
    // 上書きされ意味がない。resolutionNodeがnullのワークフロー(LTX-2.5 First&Last-Frame,
    // Wan2.2全種)でのみ、instanceNode自身のwidth/heightウィジェットを直接編集できる。
    const widthIdx = resolutionNode ? -1 : _widgetIndexOf(instanceNode, widthInput);
    const heightIdx = resolutionNode ? -1 : _widgetIndexOf(instanceNode, heightInput);

    return {
        family, sgDef, instanceNode, loadImageNode, lastLoadImageNode, resolutionNode,
        firstFrameSlot, lastFrameSlot, promptIdx, durationIdx,
        widthIdx, heightIdx, noiseSeedIdx, turboModeIdx, turboStrengthIdx, turboStepsIdx, promptEnhanceIdx,
    };
}

// Reads the current values a freshly-loaded template workflow carries, so a UI
// (the Plan tab's first block, previously the single-shot form) can seed its
// fields from whatever the workflow file already had.
export function readTemplateDefaults(nodes) {
    const {
        instanceNode, resolutionNode, loadImageNode, lastLoadImageNode, promptIdx, durationIdx,
        widthIdx, heightIdx, noiseSeedIdx, turboModeIdx, turboStrengthIdx, turboStepsIdx, promptEnhanceIdx,
    } = nodes;
    const arIdx = widgetIndex(resolutionNode, "aspect_ratio");
    const mpIdx = widgetIndex(resolutionNode, "megapixels");
    const multIdx = widgetIndex(resolutionNode, "multiple");
    const fnIdx = widgetIndex(loadImageNode, "image");
    const lastFnIdx = widgetIndex(lastLoadImageNode, "image");
    return {
        prompt: instanceNode.widgets_values[promptIdx] ?? "",
        duration: instanceNode.widgets_values[durationIdx] ?? 2,
        hasResolution: !!resolutionNode,
        aspectRatio: (resolutionNode && arIdx !== -1) ? resolutionNode.widgets_values[arIdx] : null,
        megapixels: (resolutionNode && mpIdx !== -1) ? resolutionNode.widgets_values[mpIdx] : null,
        multiple: (resolutionNode && multIdx !== -1) ? resolutionNode.widgets_values[multIdx] : null,
        firstImageFilename: (loadImageNode && fnIdx !== -1) ? loadImageNode.widgets_values[fnIdx] : null,
        lastImageFilename: (lastLoadImageNode && lastFnIdx !== -1) ? lastLoadImageNode.widgets_values[lastFnIdx] : null,
        // width/heightは resolutionNode がある場合は widthIdx/heightIdx が -1 になる
        // (locateVideoModelNodes参照) ため、常にnullが返り直接入力欄は無効化される。
        hasDirectResolution: widthIdx !== -1 && heightIdx !== -1,
        width: widthIdx !== -1 ? instanceNode.widgets_values[widthIdx] : null,
        height: heightIdx !== -1 ? instanceNode.widgets_values[heightIdx] : null,
        hasNoiseSeed: noiseSeedIdx !== -1,
        noiseSeed: noiseSeedIdx !== -1 ? instanceNode.widgets_values[noiseSeedIdx] : null,
        hasTurboMode: turboModeIdx !== -1,
        turboMode: turboModeIdx !== -1 ? instanceNode.widgets_values[turboModeIdx] : null,
        hasTurboStrength: turboStrengthIdx !== -1,
        turboStrength: turboStrengthIdx !== -1 ? instanceNode.widgets_values[turboStrengthIdx] : null,
        hasTurboSteps: turboStepsIdx !== -1,
        turboSteps: turboStepsIdx !== -1 ? instanceNode.widgets_values[turboStepsIdx] : null,
        hasPromptEnhance: promptEnhanceIdx !== -1,
        promptEnhance: promptEnhanceIdx !== -1 ? instanceNode.widgets_values[promptEnhanceIdx] : null,
    };
}

// first_frame/last_frameが未接続のワークフローに対して、画像が指定された時だけ
// LoadImageノードを新規注入する共通ヘルパー。ノードID/リンクIDはclone内の実際の
// 最大値+1で採番するため、重複ID/リンクID不整合は起きない
// (CLAUDE.md記載の既知の落とし穴への対策)。
export function injectFrameNode(clone, instanceNode, targetSlot, filename) {
    const maxNodeId = Math.max(clone.last_node_id || 0, ...clone.nodes.map((n) => n.id));
    const maxLinkId = Math.max(clone.last_link_id || 0, ...clone.links.map((l) => l[0]));
    const newNodeId = maxNodeId + 1;
    const newLinkId = maxLinkId + 1;

    clone.nodes.push({
        id: newNodeId,
        type: "LoadImage",
        pos: [(instanceNode.pos?.[0] || 0) - 260, (instanceNode.pos?.[1] || 0) + 40],
        size: [280, 314],
        flags: {},
        order: clone.nodes.length,
        mode: 0,
        inputs: [
            { localized_name: "image", name: "image", type: "COMBO", widget: { name: "image" }, link: null },
            { localized_name: "choose file to upload", name: "upload", type: "IMAGEUPLOAD", widget: { name: "upload" }, link: null },
        ],
        outputs: [
            { localized_name: "IMAGE", name: "IMAGE", type: "IMAGE", links: [newLinkId] },
            { localized_name: "MASK", name: "MASK", type: "MASK", links: null },
        ],
        properties: { "Node name for S&R": "LoadImage" },
        widgets_values: [filename, "image"],
    });

    clone.links.push([newLinkId, newNodeId, 0, instanceNode.id, targetSlot, "IMAGE"]);
    const targetInput = instanceNode.inputs[targetSlot];
    if (targetInput) targetInput.link = newLinkId;

    clone.last_node_id = newNodeId;
    clone.last_link_id = newLinkId;
}

// Writes one block's (or the old single-shot form's) values onto a workflow
// clone already located via locateVideoModelNodes(clone) — `nodes`' node
// references point into `clone` itself. First/last frame images are only
// touched when a filename is actually given: an existing LoadImage node gets
// its widget overwritten, a missing one gets injected on demand, and leaving
// both unset keeps the slot disconnected (bypassed) exactly like the
// template's own clean state.
export function applyBlockToWorkflow(clone, nodes, params) {
    const {
        instanceNode, resolutionNode, loadImageNode, lastLoadImageNode, promptIdx, durationIdx, firstFrameSlot, lastFrameSlot,
        widthIdx, heightIdx, turboModeIdx, turboStrengthIdx, turboStepsIdx, promptEnhanceIdx,
    } = nodes;

    instanceNode.widgets_values[promptIdx] = params.prompt || "";
    instanceNode.widgets_values[durationIdx] = params.duration;

    const arIdx = widgetIndex(resolutionNode, "aspect_ratio");
    const mpIdx = widgetIndex(resolutionNode, "megapixels");
    const multIdx = widgetIndex(resolutionNode, "multiple");
    if (arIdx !== -1) resolutionNode.widgets_values[arIdx] = params.aspectRatio;
    if (mpIdx !== -1) resolutionNode.widgets_values[mpIdx] = params.megapixels;
    if (multIdx !== -1) resolutionNode.widgets_values[multIdx] = params.multiple;

    // widthIdx/heightIdxはresolutionNodeがあるワークフローでは-1固定(locateVideoModelNodes
    // 参照)なので、そちらはaspect_ratio/megapixels/multiple経由の計算値のまま変更しない。
    if (widthIdx !== -1 && params.width != null) instanceNode.widgets_values[widthIdx] = params.width;
    if (heightIdx !== -1 && params.height != null) instanceNode.widgets_values[heightIdx] = params.height;
    // noise_seedはここでは書かない — comfyUI.generate()がAPI変換後のワークフロー全体から
    // "noise_seed"/"seed"キーを持つ全ノードを一括で上書きする(applySeedToWorkflow)ため、
    // ここで書いてもその後必ず上書きされる。Plan全体のシード管理は引き続きそちら任せでよい。
    if (turboModeIdx !== -1 && params.turboMode != null) instanceNode.widgets_values[turboModeIdx] = params.turboMode;
    if (turboStrengthIdx !== -1 && params.turboStrength != null) instanceNode.widgets_values[turboStrengthIdx] = params.turboStrength;
    if (turboStepsIdx !== -1 && params.turboSteps != null) instanceNode.widgets_values[turboStepsIdx] = params.turboSteps;
    if (promptEnhanceIdx !== -1 && params.promptEnhance != null) instanceNode.widgets_values[promptEnhanceIdx] = params.promptEnhance;

    if (params.firstImageFilename) {
        if (loadImageNode) {
            const fnIdx = widgetIndex(loadImageNode, "image");
            if (fnIdx !== -1) loadImageNode.widgets_values[fnIdx] = params.firstImageFilename;
        } else if (firstFrameSlot !== -1) {
            injectFrameNode(clone, instanceNode, firstFrameSlot, params.firstImageFilename);
        }
    }
    if (params.lastImageFilename) {
        if (lastLoadImageNode) {
            const fnIdx = widgetIndex(lastLoadImageNode, "image");
            if (fnIdx !== -1) lastLoadImageNode.widgets_values[fnIdx] = params.lastImageFilename;
        } else if (lastFrameSlot !== -1) {
            injectFrameNode(clone, instanceNode, lastFrameSlot, params.lastImageFilename);
        }
    }
}
