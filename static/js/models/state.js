/**
 * Models Tab - Shared state and static lookup tables
 * `state` is a `const` object never reassigned — modules read/write its
 * properties directly, which stays within ESM's read-only binding rule
 * (only the binding itself, not the object it points to, is immutable).
 */

import { comfyUI } from "../comfyui-client.js";

export const RESERVED_GROUPS = ["Batch", "Stack"];
export const BATCH_MODEL_TYPES = ["checkpoint", "lora"];
export const STACK_MODEL_TYPES = ["lora"];

export const state = {
    modelsByType: {
        checkpoint: [],
        lora: [],
        vae: [],
        controlnet: [],
        unet: [],
        textencoder: [],
        hypernetwork: [],
        embedding: [],
    },
    modelMetadata: {},
    modelGroups: {},
    allModelGroups: {},  // { type: { groupName: [models] } } — all types
    civitaiCache: {},
    disabledModels: {},   // { type: Set<modelName> }
    subdirs: [],
    selectMode: false,
    selectedModels: new Set(),
    searchText: "",
    tagFilter: "",
    badgeFilter: "",
    dirFilter: "",
    groupFilter: "",
    statusFilter: "all",  // "all" | "enabled" | "disabled"
    showFavoritesOnly: false,
    showBatchOnly: false,
    viewMode: localStorage.getItem("wfm_models_view") === "table" ? "table" : "thumb",
    activeModelType: "checkpoint",
    selectedModel: null,
    loaded: {},
    currentPage: 0,
    sortColumn: null,  // "fav" | "filename" | "subdir" | "civtype" | "basemodel" | "ext" | "tags" | "memo" | "enabled"
    sortDir: "asc",    // "asc" | "desc"
};


export const FETCH_MAP = {
    checkpoint: () => comfyUI.fetchCheckpoints(),
    lora: () => comfyUI.fetchLoras(),
    vae: () => comfyUI.fetchVaes(),
    controlnet: () => comfyUI.fetchControlNets(),
    unet: () => comfyUI.fetchDiffusionModels(),
    textencoder: () => comfyUI.fetchTextEncoders(),
    hypernetwork: () => comfyUI.fetchHypernetworks(),
    embedding: () => comfyUI.fetchEmbeddings(),
};

export const TYPE_LABELS = {
    checkpoint: "Checkpoint",
    lora: "LoRA",
    vae: "VAE",
    controlnet: "ControlNet",
    unet: "UNET",
    textencoder: "TextEncoder",
    hypernetwork: "Hypernetwork",
    embedding: "Embedding",
};

// Mapping from models-tab type → comfyui-editor key + inputKey
export const GENUI_TYPE_MAP = {
    checkpoint:   { key: "checkpoints",    inputKey: "ckpt_name" },
    lora:         { key: "loras",          inputKey: "lora_name" },
    vae:          { key: "vaes",           inputKey: "vae_name" },
    controlnet:   { key: "controlNets",    inputKey: "control_net_name" },
    unet:         { key: "diffusionModels",inputKey: "unet_name" },
    textencoder:  { key: "textEncoders",   inputKey: "clip_name1" },
    hypernetwork: { key: "hypernetworks",  inputKey: "hypernetwork_name" },
};
