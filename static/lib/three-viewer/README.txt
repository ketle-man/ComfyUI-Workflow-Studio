Gallery 3D viewer bundle (glb / gltf / vrm / ply / spz).
  three 0.187.0, @pixiv/three-vrm 3.5.5, @sparkjsdev/spark 2.4.0 (see LICENSE)
Source entry: entry.js.txt (rename to entry.js to rebuild)
Built with:
  esbuild entry.js --bundle --format=esm --splitting --minify --target=es2022 \
    --outdir=out --entry-names=three-viewer --chunk-names=chunk-[hash]
Spark is a separate chunk, loaded only when a Gaussian splat is opened.
draco/ is copied from three/examples/jsm/libs/draco/gltf.
