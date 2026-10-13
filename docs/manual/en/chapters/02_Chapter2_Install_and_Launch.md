# Chapter 2 Installation and Launch

In this chapter we add Workflow Studio to ComfyUI and go as far as opening its screen for the first time.
It assumes that ComfyUI itself is already installed and can be launched.

---

## 2-1 What you need

### Required
| What you need | Description |
| --- | --- |
| ComfyUI | A recent version is fine. Because it uses a feature that places buttons in the top menu, a fairly new version (frontend v1.33.9 or later) is recommended |
| Python 3.10 or later | The one bundled with ComfyUI is fine |
| A web browser | Such as Chrome or Edge: the browser in which you open the ComfyUI screen |

The basic features of Workflow Studio work with no extra preparation as long as ComfyUI is running.

### Later, as needed
The following are needed only when you use particular features. You can ignore them at first.

- **Ollama, LM Studio and similar** - AI support features such as prompt translation and AI chat (Chapter 10)
- **Eagle** - a feature that automatically saves generated images to the image-management software Eagle (Chapter 8)
- **Extra Python packages** - Tagger (tag generation from images), PSD export and the like (Chapter 11)

> **Tip**
> It is not the case that "you can't use it unless you have everything".
> Start by installing only the main part, and add things when features you want to use come up.

---

## 2-2 Install with ComfyUI Manager (recommended)

**ComfyUI Manager** is a management tool that lets you search for and install custom nodes (extensions) from the screen.
Recent versions of ComfyUI often include it from the start, and it is the easiest method.

1. Start ComfyUI and open its screen in the browser.
2. Click the **"Manager"** button in the top menu.

3. Click **"Custom Nodes Manager"**.
4. Type **`Workflow Studio`** in the search box.
5. Click **"Install"** on **ComfyUI-Workflow-Studio** in the list.

6. When the installation finishes, **restart ComfyUI** following the on-screen guidance.

> **Caution**
> ComfyUI loads extensions only once, when it starts.
> Always restart ComfyUI after installing. Reloading the browser alone will not take effect.

---

## 2-3 Install manually (git clone)

If ComfyUI Manager is not available, or if you are comfortable with Git, you can also install manually.
You use a screen where you type commands (on Windows, "Command Prompt" or "Terminal").

1. Move to the **`custom_nodes`** folder inside the ComfyUI folder.

   ```
   cd ComfyUI/custom_nodes
   ```

2. Type the following command to download Workflow Studio.

   ```
   git clone https://github.com/ketle-man/ComfyUI-Workflow-Studio.git
   ```

3. If a **`ComfyUI-Workflow-Studio`** folder now exists inside `custom_nodes`, it worked.
4. Restart ComfyUI.

> **Tip**
> If the `git` command is not available, you first need to install Git (for example Git for Windows).
> If you are unsure, the ComfyUI Manager method in 2-2 is recommended.

---

## 2-4 Launching

### Open it from the W button
When you restart ComfyUI, a **"W"** button has been added to the menu at the top of the screen.
This is the button that opens Workflow Studio.

- **Click** - Workflow Studio opens in a new tab.
- **Shift + click** - It opens in a new window. Handy when you want to use it side by side with the ComfyUI screen.

A **camera button** has also been added near the W button.
It is the button for saving a workflow screen as a thumbnail (you use it in Chapter 4).

### How addresses and port numbers work
When you press the W button, the address of Workflow Studio appears in the browser's address bar.
Knowing how to read this address lets you open it directly from a bookmark and track down causes when something goes wrong.

The address is made of the following three parts.

| Part | Example | Meaning |
| --- | --- | --- |
| Host | `127.0.0.1` | Which computer to connect to. `127.0.0.1` (or `localhost`) is a special address meaning "this computer" |
| Port number | `8188` | Which piece of software on that computer to connect to |
| Path | `/wfm` | Which page inside that software to open |

Joining these three in the form "`host:port-number/path`" gives the address of Workflow Studio.

#### What is a port number?
Many pieces of software on one computer communicate at the same time.
The **port number** is what is used to distinguish which software a communication is meant for.

To use an apartment building as an analogy, the host (`127.0.0.1`) is the "address of the building" and the port number is the "room number".
Even in the same building, if you get the room number wrong, you will not reach the person you want.

ComfyUI listens on a port number decided when it starts.
Commonly used numbers are as follows.

| Kind of ComfyUI / how it was started | Commonly used port number |
| --- | --- |
| Portable version or manual install (default settings) | 8188 |
| ComfyUI Desktop (the desktop app version) | 8000 |
| When the `--port` startup option is given | The number you specified |

If you use a launcher such as Stability Matrix, the number may also change depending on the launcher's settings.

#### Checking your own port number
The most reliable way is to **look at the address bar of the browser in which you have ComfyUI open right now**.
The number after `127.0.0.1:` or `localhost:` is the port number.

The black screen (console) shown when you start ComfyUI also displays a line such as
`To see the GUI go to: http://127.0.0.1:XXXX`.

#### Opening it by typing the address directly
If you know the port number, you can open Workflow Studio without the W button.
Just add **`/wfm`** to the end of ComfyUI's address.

- ComfyUI is open at `127.0.0.1:8188` -> Workflow Studio is at `127.0.0.1:8188/wfm`
- ComfyUI is open at `127.0.0.1:8000` -> Workflow Studio is at `127.0.0.1:8000/wfm`

If you use it often, bookmarking this address is handy.

> **Caution**
> When you open it from a bookmark, "Send to Canvas", which sends a workflow directly to ComfyUI's canvas, cannot be used.
> Instead, that workflow appears in ComfyUI's side panel (the WS Library), and you drag it onto the canvas yourself (Chapters 4 and 9).
> If you use it while going back and forth with the ComfyUI screen, opening it from the W button is recommended.

> **Tip**
> Workflow Studio runs as a part of ComfyUI, so it uses the same port number as ComfyUI.
> There is no port number dedicated to Workflow Studio.

---

## 2-5 Changing the display language

Workflow Studio is displayed in **English** at first. You can switch it to Japanese or Chinese as follows.

1. Open **"Settings"** from the tabs at the top.
2. In the **"UI Language"** field, choose the language you want.

3. After a notice that the language was changed, the page reloads automatically and switches to the new display language.

If you switch to Japanese, the tab names change as follows (some stay in English).

| English display | Japanese display |
| --- | --- |
| Workflow | ワークフロー |
| GenerateUI | 生成UI |
| Gallery | ギャラリー |
| Prompt | プロンプト |
| Models | モデル |
| Nodes | ノード |
| Settings | 設定 |
| Help | ヘルプ |
| AI TOOL / Tagger / Image Edit / Video | (stay in English) |

> **Tip**
> The language setting is saved **per browser** you use.
> If you open it from another browser or another computer, set it again.

The **"Summary Language"** field in the same place is the language used when AI creates descriptions of workflows (Chapter 10). You do not need to change it for now.

---

## 2-6 Folder locations in each environment

There are several ways to install ComfyUI. Depending on how it was installed, the folder locations differ slightly.
In this book, folder locations are written in a form **starting from `ComfyUI/`**.
Read it as the "place that corresponds to `ComfyUI/`" in the table below, to match your environment.

### How this book writes it, and where it is in each environment
| Notation in this book | Contents | Portable version | ComfyUI Desktop | Stability Matrix |
| --- | --- | --- | --- | --- |
| `ComfyUI/` | ComfyUI's main folder | `ComfyUI_windows_portable/ComfyUI/` | The folder you chose at install time (by default `ComfyUI` inside "Documents") | `(data folder)/Packages/ComfyUI/` |
| `ComfyUI/custom_nodes/` | Custom nodes (Workflow Studio too) | `ComfyUI/custom_nodes/` | `ComfyUI/custom_nodes/` | `ComfyUI/custom_nodes/` |
| `ComfyUI/models/` | Models | `ComfyUI/models/` | `ComfyUI/models/` | `(data folder)/Models/` (shared by all packages) |
| `ComfyUI/output/` | Generated images | `ComfyUI/output/` | `ComfyUI/output/` | `(data folder)/Images/` |
| `ComfyUI/user/default/workflows/` | Saved workflows | `ComfyUI/user/default/workflows/` | `ComfyUI/user/default/workflows/` | `ComfyUI/user/default/workflows/` |
| ComfyUI's Python | Where extra packages are installed | `ComfyUI_windows_portable/python_embeded/python.exe` | `ComfyUI/.venv/Scripts/python.exe` | `ComfyUI/venv/Scripts/python.exe` |
| Default port number | See 2-4 | 8188 | 8000 | 8188 |

> **Tip**
> `ComfyUI/` in the table refers to the "place that corresponds to `ComfyUI/`" in each environment.
> On Windows, path separators are shown as `\` instead of `/`.

### Portable version
Everything is inside the `ComfyUI_windows_portable` folder created by extracting the downloaded ZIP file.
You launch it with `run_nvidia_gpu.bat` or similar inside the folder.
For **Python**, you use the one inside the `python_embeded` folder dedicated to ComfyUI (Chapter 11, section 11-2).

### ComfyUI Desktop
This is the app version installed with an installer. At first launch, you choose the folder in which to put data.
If you forget where the folder is, you can check it with the app's menu item that opens the folder ("Open Folder" or similar).
The default port number is **8000**, so be careful when typing the address directly (2-4).

### Stability Matrix
This is a launcher that manages several image-generation programs together.
Inside the **data folder** you chose first (for example `StabilityMatrix/Data/`), things are separated as follows.

- **ComfyUI itself** - `Data/Packages/ComfyUI/`
- **Models** - folders by type inside `Data/Models/` (`StableDiffusion` for Checkpoints, `Lora` for LoRAs, and so on). They are shared with other programs
- **Generated images** - inside `Data/Images/`

> **Caution**
> In Stability Matrix, the folders for models and images are **outside ComfyUI's main folder**.
> Where this book says "put it in `ComfyUI/models/checkpoints`", put it in Stability Matrix's shared model folder (such as `Data/Models/StableDiffusion`).
> If images do not appear in the Gallery, check that the "Gallery Output Folder" in the Settings tab points inside `Data/Images/`.

> **Tip**
> Folder names and structure can change with each program's version updates.
> If you cannot find something, also check each program's official documentation.

---

## 2-7 If it does not start properly

### The W button does not appear
- **Did you restart ComfyUI?** Reloading the browser alone does not take effect.
- **Is the install location correct?** Check that the folder exists at `ComfyUI/custom_nodes/ComfyUI-Workflow-Studio`.
  If there is another folder with the same name inside it (a doubled folder), it will not be loaded.
- **Is your ComfyUI version old?** Try updating the main program from ComfyUI Manager or similar.

### The page does not open, or "cannot connect" is shown
- **Is ComfyUI running?** Workflow Studio runs inside ComfyUI, so you cannot open it if you quit ComfyUI.
- **Is the port number right?** Check ComfyUI's port number using the method in 2-4.
  For example, if you use ComfyUI Desktop but type `8188`, it will not connect.

### An error appears in the console at startup
Check whether the black screen shown when you start ComfyUI displays any error about `ComfyUI-Workflow-Studio`.
Noting the content of the error will help with the troubleshooting in Chapter 12, and when asking questions on GitHub.

> **Summary of this chapter**
> - The easy way to install is to search for "Workflow Studio" in ComfyUI Manager
> - Always restart ComfyUI after installing
> - Open it with the "W" button in the top menu (Shift + click for a separate window)
> - The address is "host:port-number/wfm". You can check the port number in the address bar where ComfyUI is open
> - Switch the language in the Settings tab with "UI Language"
> - Folder locations differ by environment (portable version, Desktop, Stability Matrix). Read `ComfyUI/` in this book accordingly
