/**
 * i18n - Internationalization module
 * Provides UI text translations and summary prompt templates.
 */

const LANGUAGES = {
    en: {
        // -- General --
        loading: "Loading...",
        noImage: "No Image",
        save: "Save",
        delete: "Delete",
        cancel: "Cancel",
        refresh: "Refresh",
        test: "Test",
        copy: "Copy",
        close: "Close",
        error: "Error",

        // -- Tabs --
        tabWorkflow: "Workflow",
        tabGenerate: "GenerateUI",
        tabSettings: "Settings",

        // -- Workflow toolbar --
        searchPlaceholder: "Search...",
        allGroups: "All Groups",
        loadInGenerate: "Load in GenerateUI",
        selectCardFirst: "Select a card first",
        reanalyzeAll: "Reanalyze All",
        import: "Import",
        badgeColors: "Badge Colors",
        resetColors: "Reset",
        defaultView: "Default View",
        viewThumbnail: "Thumbnail",
        viewCard: "Card",
        viewTable: "Table",

        // -- Workflow card / table --
        noModelDetected: "No model detected",
        favorite: "Favorite",

        // -- Side panel --
        uiFormat: "UI Format",
        apiFormat: "API Format",
        noSelection: "No selection",
        groupsLabel: "Groups",
        groupsNone: "none",
        properties: "Properties",
        groupManagement: "Group Management",
        groupNamePlaceholder: "Group name",
        addGroup: "Add",
        selectGroup: "Select group",
        renameGroup: "Rename",
        deleteGroup: "Delete",
        workflowActions: "Workflow Actions",
        addToGroup: "Add to Group",
        removeFromGroup: "Remove from Group",

        // -- Detail modal --
        analysis: "Analysis",
        analyze: "Analyze",
        analyzing: "Analyzing...",
        modelCategory: "Model Category",
        modelOverridePlaceholder: "e.g., Flux, SDXL (empty = auto)",
        tags: "Tags",
        tagsHint: "(comma separated)",
        tagsPlaceholder: "tag1, tag2, ...",
        memo: "Memo",
        memoPlaceholder: "Notes...",
        summary: "Summary",
        summarize: "Summarize",
        summarizing: "Summarizing...",
        summaryPlaceholder: "Summary...",
        openInComfyUI: "Open in ComfyUI",
        openedInComfyUI: "Opened in ComfyUI",
        comfyUILoadTimeout: "ComfyUI load timeout",
        popupBlocked: "Popup blocked. Please allow popups for this site.",
        setAsDefault: "Set as Default",
        defaultWorkflowSet: (name) => `"${name}" set as default workflow`,
        changeThumbnail: "Change Thumbnail",
        uploading: "Uploading...",
        clickToRename: "Click to rename",

        // -- Detail modal toasts --
        renamed: "Renamed successfully",
        renameError: "Rename error",
        analysisComplete: "Analysis complete",
        analyzeError: "Analyze error",
        overrideSaved: "Model override saved",
        saveError: "Save error",
        loaded: "Loaded",
        loadError: "Load error",
        thumbnailChanged: "Thumbnail changed",
        thumbnailError: "Thumbnail error",
        deleted: "Deleted",
        deleteError: "Delete error",
        deleteConfirm: (name) => `Delete "${name}"?`,
        summaryGenerated: "Summary generated",
        summarizeError: "Summarize error",
        copied: "Copied",

        // -- GenerateUI --
        image: "Image",
        noLoadImageNodes: "No LoadImage nodes found in workflow",
        dropImageOrClick: "Drop image or click to select",
        apply: "Apply",
        uploadingImage: "Uploading...",
        disconnected: "Disconnected",
        connected: "Connected",
        connect: "Connect",
        refreshModels: "Refresh Models",
        noWorkflowLoaded: "No workflow loaded",
        prompt: "Prompt",
        model: "Model",
        settings: "Settings",
        rawJson: "Raw JSON",
        applyJson: "Apply JSON",
        generate: "Generate",
        stop: "Stop",
        ready: "Ready",
        seed: "Seed",
        random: "Random",
        fixed: "Fixed",
        increment: "Increment",
        decrement: "Decrement",

        // -- Prompt tab --
        tabPrompt: "Prompt",
        you: "You",
        assistantWelcome: "Ask me about prompts, image generation, or workflow ideas. I can also translate between Japanese and English.",
        applyToGenerateUI: "Apply to GenerateUI",
        selectModelFirst: "Select a model first",
        noPromptFields: "No prompt fields found. Load a workflow in GenerateUI first.",
        appliedToGenerateUI: "Applied to GenerateUI",
        newPreset: "-- New Preset --",
        enterPresetName: "Enter a preset name",
        noPromptToSave: "No prompt text to save",
        presetSaved: "Preset saved",
        attachImage: "Attach Image",
        clearChat: "Clear Chat",
        send: "Send",
        ja2en: "JA\u2192EN",
        en2ja: "EN\u2192JA",
        presetName: "Preset Name",
        positivePrompt: "Positive Prompt",
        negativePrompt: "Negative Prompt",
        savePreset: "Save Preset",
        applyPreset: "Apply",
        deletePreset: "Delete",
        assistantSubtab: "AI Assistant",
        presetsSubtab: "Presets",

        // -- Help & Support --
        tabHelp: "Help",
        helpManualTitle: "Features",
        helpWf1: "Browse, search, and filter your workflow collection",
        helpWf2: "Import workflows from JSON or PNG files",
        helpWf3: "Organize workflows into groups",
        helpWf4: "View thumbnails, JSON details, and properties",
        helpWf5: "Click a card to open the detail modal for analysis, tagging, and summarization",
        helpGen1: "Load a workflow and edit parameters (prompts, images, models, settings)",
        helpGen2: "Connect to ComfyUI and generate images directly",
        helpGen3: "Control seed behavior (random, fixed, increment, decrement)",
        helpGen4: "View generated results with thumbnail history",
        helpPrompt1: "Chat with AI assistant (Ollama) for prompt ideas and improvements",
        helpPrompt2: "Translate prompts between Japanese, English, and Chinese",
        helpPrompt3: "Save and manage prompt presets",
        helpPrompt4: "Apply presets directly to GenerateUI",
        helpSettings1: "Configure ComfyUI connection URL",
        helpSettings2: "Set up Ollama API for AI assistant features",
        helpSettings3: "Change UI language and summary language",
        helpSettings4: "Configure workflow data folder and Eagle integration",
        helpTipsTitle: "Tips",
        helpTips1: "Drag & drop PNG files with embedded workflow data to import them",
        helpTips2: "Use the star button to mark favorite workflows for quick access",
        helpTips3: "Set a default workflow to auto-load on startup from the detail modal",
        helpSupportTitle: "Support",
        helpSupportDesc: "If you find this plugin useful, please consider supporting its development!",
        helpGithubDesc: "Report issues, request features, and contribute",
        helpKofiDesc: "Buy me a coffee to support development",
        helpThanks: "Thank you for using Workflow Studio!",

        // -- Settings --
        workflowsDir: "Workflow Data Folder",
        workflowsDirLabel: "Folder Path",
        workflowsDirHint: "Default: ComfyUI's user/default/workflows. Leave empty to reset to default.",
        workflowsDirDefault: "Default",
        workflowsDirApply: "Apply",
        workflowsDirCurrent: "Current",
        workflowsDirChanged: "Workflow folder changed. Refresh the workflow list.",
        workflowsDirError: "Folder change error",
        workflowsDirBrowseHint: "Enter the full path to the folder containing workflow JSON files.",
        settingsTitle: "Settings",
        langLabel: "UI Language",
        summaryLangLabel: "Summary Language",
        summaryLangNote: "Summary language depends on the Ollama model's multilingual capability. Some models may not support the selected language.",
        comfyuiConnection: "ComfyUI Connection",
        comfyuiUrl: "ComfyUI URL",
        comfyuiUrlHint: "When running as ComfyUI plugin, leave empty to use same origin. Only set if ComfyUI is on a different server.",
        connectedCheck: "Connected \u2713",
        failedConnect: "Failed to connect \u2717",
        ollamaSettings: "Ollama Settings",
        ollamaUrl: "Ollama API URL",
        ollamaDefaultModel: "Default Model",
        selectModel: "Select model...",
        noModelsFound: "No models found",
        failedLoadModels: "Failed to load models",
        saveOllama: "Save Ollama Settings",
        testConnection: "Test Connection",
        ollamaConnected: "Connected \u2713",
        ollamaFailed: "Failed",
        defaultWorkflow: "Default Workflow",
        defaultWorkflowNone: "(None)",
        defaultWorkflowCleared: "Default workflow cleared",
        defaultWorkflowHint: "Set from the workflow detail modal. Auto-loaded when the page opens.",
        clear: "Clear",
        eagleIntegration: "Eagle Integration (Optional)",
        eagleUrl: "Eagle URL",
        eagleAutoSave: "Auto-save generated images to Eagle",
        saveSettings: "Save Settings",
        settingsSaved: "Settings saved",
        ollamaSaved: "Ollama settings saved",
    },

    ja: {
        // -- General --
        loading: "読み込み中...",
        noImage: "画像なし",
        save: "保存",
        delete: "削除",
        cancel: "キャンセル",
        refresh: "更新",
        test: "テスト",
        copy: "コピー",
        close: "閉じる",
        error: "エラー",

        // -- Tabs --
        tabWorkflow: "ワークフロー",
        tabGenerate: "生成UI",
        tabSettings: "設定",

        // -- Workflow toolbar --
        searchPlaceholder: "検索...",
        allGroups: "全グループ",
        loadInGenerate: "生成UIに読み込み",
        selectCardFirst: "カードを選択してください",
        reanalyzeAll: "全て再分析",
        import: "インポート",
        badgeColors: "バッジ色",
        resetColors: "リセット",
        defaultView: "デフォルト表示",
        viewThumbnail: "サムネイル",
        viewCard: "カード",
        viewTable: "テーブル",

        // -- Workflow card / table --
        noModelDetected: "モデル未検出",
        favorite: "お気に入り",

        // -- Side panel --
        uiFormat: "UI形式",
        apiFormat: "API形式",
        noSelection: "未選択",
        groupsLabel: "グループ",
        groupsNone: "なし",
        properties: "プロパティ",
        groupManagement: "グループ管理",
        groupNamePlaceholder: "グループ名",
        addGroup: "追加",
        selectGroup: "グループ選択",
        renameGroup: "名前変更",
        deleteGroup: "削除",
        workflowActions: "ワークフロー操作",
        addToGroup: "グループに追加",
        removeFromGroup: "グループから除去",

        // -- Detail modal --
        analysis: "分析",
        analyze: "分析",
        analyzing: "分析中...",
        modelCategory: "モデルカテゴリ",
        modelOverridePlaceholder: "例: Flux, SDXL (空欄 = 自動)",
        tags: "タグ",
        tagsHint: "(カンマ区切り)",
        tagsPlaceholder: "タグ1, タグ2, ...",
        memo: "メモ",
        memoPlaceholder: "メモ...",
        summary: "要約",
        summarize: "要約",
        summarizing: "要約中...",
        summaryPlaceholder: "要約...",
        openInComfyUI: "ComfyUIで開く",
        openedInComfyUI: "ComfyUIで開きました",
        comfyUILoadTimeout: "ComfyUIの読み込みがタイムアウトしました",
        popupBlocked: "ポップアップがブロックされました。このサイトのポップアップを許可してください。",
        setAsDefault: "デフォルトに設定",
        defaultWorkflowSet: (name) => `"${name}" をデフォルトワークフローに設定しました`,
        changeThumbnail: "サムネイル変更",
        uploading: "アップロード中...",
        clickToRename: "クリックで名前変更",

        // -- Detail modal toasts --
        renamed: "名前を変更しました",
        renameError: "名前変更エラー",
        analysisComplete: "分析完了",
        analyzeError: "分析エラー",
        overrideSaved: "モデルオーバーライドを保存しました",
        saveError: "保存エラー",
        loaded: "読み込み完了",
        loadError: "読み込みエラー",
        thumbnailChanged: "サムネイルを変更しました",
        thumbnailError: "サムネイルエラー",
        deleted: "削除しました",
        deleteError: "削除エラー",
        deleteConfirm: (name) => `"${name}" を削除しますか？`,
        summaryGenerated: "要約を生成しました",
        summarizeError: "要約エラー",
        copied: "コピーしました",

        // -- GenerateUI --
        image: "画像",
        noLoadImageNodes: "ワークフローにLoadImageノードがありません",
        dropImageOrClick: "画像をドロップまたはクリックして選択",
        apply: "適用",
        uploadingImage: "アップロード中...",
        disconnected: "未接続",
        connected: "接続済み",
        connect: "接続",
        refreshModels: "モデル更新",
        noWorkflowLoaded: "ワークフロー未読込",
        prompt: "プロンプト",
        model: "モデル",
        settings: "設定",
        rawJson: "Raw JSON",
        applyJson: "JSON適用",
        generate: "生成",
        stop: "停止",
        ready: "準備完了",
        seed: "シード",
        random: "ランダム",
        fixed: "固定",
        increment: "増加",
        decrement: "減少",

        // -- Prompt tab --
        tabPrompt: "プロンプト",
        you: "あなた",
        assistantWelcome: "プロンプト、画像生成、ワークフローのアイデアについてお気軽にどうぞ。日英翻訳もできます。",
        applyToGenerateUI: "生成UIに適用",
        selectModelFirst: "モデルを選択してください",
        noPromptFields: "プロンプト欄が見つかりません。先に生成UIでワークフローを読み込んでください。",
        appliedToGenerateUI: "生成UIに適用しました",
        newPreset: "-- 新規プリセット --",
        enterPresetName: "プリセット名を入力してください",
        noPromptToSave: "保存するプロンプトがありません",
        presetSaved: "プリセットを保存しました",
        attachImage: "画像添付",
        clearChat: "チャットクリア",
        send: "送信",
        ja2en: "日→英",
        en2ja: "英→日",
        presetName: "プリセット名",
        positivePrompt: "ポジティブプロンプト",
        negativePrompt: "ネガティブプロンプト",
        savePreset: "プリセット保存",
        applyPreset: "適用",
        deletePreset: "削除",
        assistantSubtab: "AIアシスタント",
        presetsSubtab: "プリセット",

        // -- Help & Support --
        tabHelp: "ヘルプ",
        helpManualTitle: "機能一覧",
        helpWf1: "ワークフローの閲覧、検索、フィルタリング",
        helpWf2: "JSONやPNGファイルからワークフローをインポート",
        helpWf3: "グループでワークフローを整理",
        helpWf4: "サムネイル、JSON詳細、プロパティの表示",
        helpWf5: "カードをクリックして詳細モーダルで分析、タグ付け、要約を実行",
        helpGen1: "ワークフローを読み込み、パラメータ（プロンプト、画像、モデル、設定）を編集",
        helpGen2: "ComfyUIに接続して直接画像を生成",
        helpGen3: "シード動作の制御（ランダム、固定、増加、減少）",
        helpGen4: "サムネイル履歴付きで生成結果を表示",
        helpPrompt1: "AIアシスタント（Ollama）とチャットしてプロンプトのアイデアや改善を得る",
        helpPrompt2: "日本語、英語、中国語間でプロンプトを翻訳",
        helpPrompt3: "プロンプトプリセットの保存と管理",
        helpPrompt4: "プリセットを生成UIに直接適用",
        helpSettings1: "ComfyUI接続URLの設定",
        helpSettings2: "AIアシスタント機能用のOllama APIを設定",
        helpSettings3: "UI言語と要約言語の変更",
        helpSettings4: "ワークフローデータフォルダとEagle連携の設定",
        helpTipsTitle: "ヒント",
        helpTips1: "ワークフローデータが埋め込まれたPNGファイルをドラッグ＆ドロップでインポート",
        helpTips2: "スターボタンでお気に入りワークフローをマークして素早くアクセス",
        helpTips3: "詳細モーダルからデフォルトワークフローを設定し、起動時に自動読み込み",
        helpSupportTitle: "サポート",
        helpSupportDesc: "このプラグインが役に立ったら、開発を支援していただけると嬉しいです！",
        helpGithubDesc: "バグ報告、機能リクエスト、コントリビュート",
        helpKofiDesc: "コーヒーを奢って開発を応援",
        helpThanks: "Workflow Studioをご利用いただきありがとうございます！",

        // -- Settings --
        workflowsDir: "ワークフローデータフォルダ",
        workflowsDirLabel: "フォルダパス",
        workflowsDirHint: "デフォルト: ComfyUIの user/default/workflows。空欄でデフォルトにリセット。",
        workflowsDirDefault: "デフォルト",
        workflowsDirApply: "適用",
        workflowsDirCurrent: "現在",
        workflowsDirChanged: "ワークフローフォルダを変更しました。ワークフロー一覧を更新してください。",
        workflowsDirError: "フォルダ変更エラー",
        workflowsDirBrowseHint: "ワークフローJSONファイルが含まれるフォルダのフルパスを入力してください。",
        settingsTitle: "設定",
        langLabel: "UI言語",
        summaryLangLabel: "要約言語",
        summaryLangNote: "要約言語はOllamaモデルの多言語対応に依存します。モデルによっては選択した言語に対応していない場合があります。",
        comfyuiConnection: "ComfyUI 接続",
        comfyuiUrl: "ComfyUI URL",
        comfyuiUrlHint: "ComfyUIプラグインとして動作する場合は空欄（同一オリジン推奨）。別サーバーの場合のみ設定してください。",
        connectedCheck: "接続成功 \u2713",
        failedConnect: "接続失敗 \u2717",
        ollamaSettings: "Ollama 設定",
        ollamaUrl: "Ollama API URL",
        ollamaDefaultModel: "デフォルトモデル",
        selectModel: "モデルを選択...",
        noModelsFound: "モデルが見つかりません",
        failedLoadModels: "モデル一覧の取得に失敗",
        saveOllama: "Ollama設定を保存",
        testConnection: "接続テスト",
        ollamaConnected: "接続成功 \u2713",
        ollamaFailed: "失敗",
        defaultWorkflow: "デフォルトワークフロー",
        defaultWorkflowNone: "(なし)",
        defaultWorkflowCleared: "デフォルトワークフローを解除しました",
        defaultWorkflowHint: "ワークフロー詳細モーダルから設定してください。ページ起動時に自動読み込みされます。",
        clear: "クリア",
        eagleIntegration: "Eagle 連携 (オプション)",
        eagleUrl: "Eagle URL",
        eagleAutoSave: "生成画像をEagleに自動保存",
        saveSettings: "設定を保存",
        settingsSaved: "設定を保存しました",
        ollamaSaved: "Ollama設定を保存しました",
    },

    zh: {
        // -- General --
        loading: "加载中...",
        noImage: "无图片",
        save: "保存",
        delete: "删除",
        cancel: "取消",
        refresh: "刷新",
        test: "测试",
        copy: "复制",
        close: "关闭",
        error: "错误",

        // -- Tabs --
        tabWorkflow: "工作流",
        tabGenerate: "生成UI",
        tabSettings: "设置",

        // -- Workflow toolbar --
        searchPlaceholder: "搜索...",
        allGroups: "全部分组",
        loadInGenerate: "加载到生成UI",
        selectCardFirst: "请先选择卡片",
        reanalyzeAll: "全部重新分析",
        import: "导入",
        badgeColors: "标签颜色",
        resetColors: "重置",
        defaultView: "默认视图",
        viewThumbnail: "缩略图",
        viewCard: "卡片",
        viewTable: "表格",

        // -- Workflow card / table --
        noModelDetected: "未检测到模型",
        favorite: "收藏",

        // -- Side panel --
        uiFormat: "UI格式",
        apiFormat: "API格式",
        noSelection: "未选择",
        groupsLabel: "分组",
        groupsNone: "无",
        properties: "属性",
        groupManagement: "分组管理",
        groupNamePlaceholder: "分组名称",
        addGroup: "添加",
        selectGroup: "选择分组",
        renameGroup: "重命名",
        deleteGroup: "删除",
        workflowActions: "工作流操作",
        addToGroup: "添加到分组",
        removeFromGroup: "从分组移除",

        // -- Detail modal --
        analysis: "分析",
        analyze: "分析",
        analyzing: "分析中...",
        modelCategory: "模型类别",
        modelOverridePlaceholder: "例如: Flux, SDXL (空 = 自动)",
        tags: "标签",
        tagsHint: "(逗号分隔)",
        tagsPlaceholder: "标签1, 标签2, ...",
        memo: "备注",
        memoPlaceholder: "备注...",
        summary: "摘要",
        summarize: "摘要",
        summarizing: "生成摘要中...",
        summaryPlaceholder: "摘要...",
        openInComfyUI: "在ComfyUI中打开",
        openedInComfyUI: "已在ComfyUI中打开",
        comfyUILoadTimeout: "ComfyUI加载超时",
        popupBlocked: "弹窗被阻止。请允许此站点的弹窗。",
        setAsDefault: "设为默认",
        defaultWorkflowSet: (name) => `已将 "${name}" 设为默认工作流`,
        changeThumbnail: "更换缩略图",
        uploading: "上传中...",
        clickToRename: "点击重命名",

        // -- Detail modal toasts --
        renamed: "重命名成功",
        renameError: "重命名错误",
        analysisComplete: "分析完成",
        analyzeError: "分析错误",
        overrideSaved: "模型覆盖已保存",
        saveError: "保存错误",
        loaded: "已加载",
        loadError: "加载错误",
        thumbnailChanged: "缩略图已更换",
        thumbnailError: "缩略图错误",
        deleted: "已删除",
        deleteError: "删除错误",
        deleteConfirm: (name) => `确定删除 "${name}" 吗？`,
        summaryGenerated: "摘要已生成",
        summarizeError: "摘要错误",
        copied: "已复制",

        // -- GenerateUI --
        image: "图片",
        noLoadImageNodes: "工作流中没有LoadImage节点",
        dropImageOrClick: "拖放图片或点击选择",
        apply: "应用",
        uploadingImage: "上传中...",
        disconnected: "未连接",
        connected: "已连接",
        connect: "连接",
        refreshModels: "刷新模型",
        noWorkflowLoaded: "未加载工作流",
        prompt: "提示词",
        model: "模型",
        settings: "设置",
        rawJson: "Raw JSON",
        applyJson: "应用JSON",
        generate: "生成",
        stop: "停止",
        ready: "就绪",
        seed: "种子",
        random: "随机",
        fixed: "固定",
        increment: "递增",
        decrement: "递减",

        // -- Prompt tab --
        tabPrompt: "提示词",
        you: "你",
        assistantWelcome: "询问关于提示词、图像生成或工作流创意的问题。还可以进行日英翻译。",
        applyToGenerateUI: "应用到生成UI",
        selectModelFirst: "请先选择模型",
        noPromptFields: "未找到提示词字段。请先在生成UI中加载工作流。",
        appliedToGenerateUI: "已应用到生成UI",
        newPreset: "-- 新建预设 --",
        enterPresetName: "请输入预设名称",
        noPromptToSave: "没有可保存的提示词",
        presetSaved: "预设已保存",
        attachImage: "附加图片",
        clearChat: "清空聊天",
        send: "发送",
        ja2en: "日\u2192英",
        en2ja: "英\u2192日",
        presetName: "预设名称",
        positivePrompt: "正面提示词",
        negativePrompt: "负面提示词",
        savePreset: "保存预设",
        applyPreset: "应用",
        deletePreset: "删除",
        assistantSubtab: "AI助手",
        presetsSubtab: "预设",

        // -- Help & Support --
        tabHelp: "帮助",
        helpManualTitle: "功能列表",
        helpWf1: "浏览、搜索和筛选工作流集合",
        helpWf2: "从JSON或PNG文件导入工作流",
        helpWf3: "将工作流整理到分组中",
        helpWf4: "查看缩略图、JSON详情和属性",
        helpWf5: "点击卡片打开详情弹窗进行分析、标签和摘要",
        helpGen1: "加载工作流并编辑参数（提示词、图片、模型、设置）",
        helpGen2: "连接ComfyUI直接生成图片",
        helpGen3: "控制种子行为（随机、固定、递增、递减）",
        helpGen4: "查看带缩略图历史的生成结果",
        helpPrompt1: "与AI助手（Ollama）聊天获取提示词创意和改进建议",
        helpPrompt2: "在日语、英语和中文之间翻译提示词",
        helpPrompt3: "保存和管理提示词预设",
        helpPrompt4: "将预设直接应用到生成UI",
        helpSettings1: "配置ComfyUI连接URL",
        helpSettings2: "设置AI助手功能的Ollama API",
        helpSettings3: "更改UI语言和摘要语言",
        helpSettings4: "配置工作流数据文件夹和Eagle集成",
        helpTipsTitle: "小贴士",
        helpTips1: "拖放嵌入工作流数据的PNG文件进行导入",
        helpTips2: "使用星标按钮标记收藏工作流以快速访问",
        helpTips3: "从详情弹窗设置默认工作流，启动时自动加载",
        helpSupportTitle: "支持",
        helpSupportDesc: "如果您觉得这个插件有用，请考虑支持它的开发！",
        helpGithubDesc: "报告问题、请求功能和贡献代码",
        helpKofiDesc: "请我喝杯咖啡来支持开发",
        helpThanks: "感谢您使用Workflow Studio！",

        // -- Settings --
        workflowsDir: "工作流数据文件夹",
        workflowsDirLabel: "文件夹路径",
        workflowsDirHint: "默认: ComfyUI的 user/default/workflows。留空重置为默认。",
        workflowsDirDefault: "默认",
        workflowsDirApply: "应用",
        workflowsDirCurrent: "当前",
        workflowsDirChanged: "工作流文件夹已更改。请刷新工作流列表。",
        workflowsDirError: "文件夹更改错误",
        workflowsDirBrowseHint: "输入包含工作流JSON文件的文件夹完整路径。",
        settingsTitle: "设置",
        langLabel: "UI语言",
        summaryLangLabel: "摘要语言",
        summaryLangNote: "摘要语言取决于Ollama模型的多语言能力。部分模型可能不支持所选语言。",
        comfyuiConnection: "ComfyUI 连接",
        comfyuiUrl: "ComfyUI URL",
        comfyuiUrlHint: "作为ComfyUI插件运行时留空（推荐同源）。仅在不同服务器时设置。",
        connectedCheck: "已连接 \u2713",
        failedConnect: "连接失败 \u2717",
        ollamaSettings: "Ollama 设置",
        ollamaUrl: "Ollama API URL",
        ollamaDefaultModel: "默认模型",
        selectModel: "选择模型...",
        noModelsFound: "未找到模型",
        failedLoadModels: "获取模型列表失败",
        saveOllama: "保存Ollama设置",
        testConnection: "测试连接",
        ollamaConnected: "已连接 \u2713",
        ollamaFailed: "失败",
        defaultWorkflow: "默认工作流",
        defaultWorkflowNone: "(无)",
        defaultWorkflowCleared: "已清除默认工作流",
        defaultWorkflowHint: "在工作流详情弹窗中设置。页面打开时自动加载。",
        clear: "清除",
        eagleIntegration: "Eagle 集成 (可选)",
        eagleUrl: "Eagle URL",
        eagleAutoSave: "自动保存生成图片到Eagle",
        saveSettings: "保存设置",
        settingsSaved: "设置已保存",
        ollamaSaved: "Ollama设置已保存",
    },
};

// Summary prompt templates per language
const SUMMARY_PROMPTS = {
    en: "Summarize the structure of the following ComfyUI workflow in under 200 words in English. Describe the specific node composition, features, and what it is designed to create.\nJSON: ",
    ja: "以下のComfyUIワークフローの構造を200文字以内で日本語で要約してください。具体的なノードの構成や特徴、何を作るためのものかを説明してください。\nJSON: ",
    zh: "请用中文在200字以内总结以下ComfyUI工作流的结构。描述具体的节点组成、特点以及它被设计用来创建什么。\nJSON: ",
};

// Available languages for UI display
const LANGUAGE_OPTIONS = {
    en: "English",
    ja: "日本語",
    zh: "中文",
};

// Summary language options (broader, since Ollama models may support more)
const SUMMARY_LANGUAGE_OPTIONS = {
    en: "English",
    ja: "日本語",
    zh: "中文",
    ko: "한국어",
    fr: "Français",
    de: "Deutsch",
    es: "Español",
    ru: "Русский",
    pt: "Português",
};

const SUMMARY_PROMPT_GENERIC = (lang) =>
    `Summarize the structure of the following ComfyUI workflow in under 200 words in ${SUMMARY_LANGUAGE_OPTIONS[lang] || lang}. Describe the specific node composition, features, and what it is designed to create.\nJSON: `;

// Current language state
let _currentLang = "en";
let _summaryLang = "en";

/**
 * Initialize i18n from localStorage settings.
 */
export function initI18n() {
    try {
        const s = JSON.parse(localStorage.getItem("wfm_settings") || "{}");
        _currentLang = s.uiLang || "en";
        _summaryLang = s.summaryLang || "en";
    } catch {
        _currentLang = "en";
        _summaryLang = "en";
    }
}

/**
 * Get a translated string by key.
 */
export function t(key, ...args) {
    const dict = LANGUAGES[_currentLang] || LANGUAGES.en;
    const val = dict[key] ?? LANGUAGES.en[key] ?? key;
    if (typeof val === "function") return val(...args);
    return val;
}

/**
 * Get summary prompt for current summary language.
 */
export function getSummaryPrompt() {
    return SUMMARY_PROMPTS[_summaryLang] || SUMMARY_PROMPT_GENERIC(_summaryLang);
}

/**
 * Get current UI language code.
 */
export function getLang() {
    return _currentLang;
}

/**
 * Set UI language (also persists to localStorage).
 */
export function setLang(lang) {
    _currentLang = lang;
}

/**
 * Get current summary language code.
 */
export function getSummaryLang() {
    return _summaryLang;
}

/**
 * Set summary language.
 */
export function setSummaryLang(lang) {
    _summaryLang = lang;
}

/**
 * Get available UI language options.
 */
export function getLanguageOptions() {
    return LANGUAGE_OPTIONS;
}

/**
 * Get available summary language options.
 */
export function getSummaryLanguageOptions() {
    return SUMMARY_LANGUAGE_OPTIONS;
}
