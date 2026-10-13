# Chapter 10 AI TOOL - Making Local AI Your Assistant

Workflow Studio can work together with **local AI (large language models)** running inside your computer.
If you prepare local AI, you can do things like the following.

- Translate what you thought up in your own language into an English prompt
- Chat with the AI and have it come up with prompt ideas
- Show it an image and have it make a description, prompt or tags for that image
- Have it make candidate lists for wildcards

Because it runs inside your own computer rather than as a service on the internet,
a big feature is that **what you type and the images you use are not sent outside**.

> **Tip**
> AI features are "nice to have" features. Even if you do not use them, all of Workflow Studio's basic features are available.
> If your computer has room to spare (especially GPU memory), please give them a try.

---

## 10-1 Preparing local AI software

### Supported software
Workflow Studio supports the following four pieces of local AI software.

| Software | Characteristics | Default address |
| --- | --- | --- |
| **Ollama** | The standard. Easy from downloading models to running them | `http://localhost:11434` |
| **LM Studio** | Operated from a screen. You can also look for models inside the app | `http://localhost:1234` |
| Lemonade Server | Easy to run on AMD GPUs and NPUs | `http://localhost:13305` |
| Unsloth | Requires extra setup such as an API key (for advanced users) | `http://localhost:8888` |

For beginners, **Ollama** is recommended. This chapter explains using Ollama as the example.

> **Tip**
> `localhost` in the address means "this computer", and the number after it is the **port number** (Chapter 2, section 2-4).
> Just like ComfyUI, AI software also listens on its own fixed port number.

### Preparing Ollama
1. From Ollama's official site, download the installer for your OS and install it.
2. Start Ollama (on Windows it starts automatically after installation and stays resident in the taskbar's notification area).
3. Download the AI model you will use. In Command Prompt or similar, type the following.

   ```
   ollama pull (model name)
   ```

   Model names can be checked in the model list on Ollama's official site.

> **Guide to choosing a model**
> - **You also want the image-reading feature (VLM)** -> choose a model that supports image input (vision)
>   (in the author's testing, image generation and image reading work well with Gemma 4 `e4b` and similar)
> - **GPU memory is small** -> choose a model with a small parameter count (a few B, that is a few billion)
> - If translation accuracy matters, choose a model that is good at your language
>
> The world of AI models changes quickly, so please try newer models too.

> **Caution: competing for GPU memory**
> Local AI also uses **GPU memory (VRAM)**, just like image generation.
> If you run both at the same time, memory runs short and image generation slows down or errors out.
> Countermeasures are explained in 10-3.

---

## 10-2 Using the AI TOOL tab

Open the **AI TOOL** tab of the main Workflow Studio.
The screen is divided into four parts, all shown at the same time.

| Part | What you can do |
| --- | --- |
| Translate | Translation between languages such as Japanese, English and Chinese |
| Chat | Conversation with the AI. If the conditions are met, generating images from the conversation too |
| TOOLS | Reading images (VLM), making wildcards |
| Settings | Settings for which AI software and model to use |

### First: connect to the AI software in the settings
1. In **Backend** under the settings, choose the software to use (for example Ollama).
2. Check the address under **Connection**. If you use Ollama with its defaults, no change is needed.
3. Press **Test Connection**. If it shows success, it is OK.
4. Press **Refresh** next to **Model** and choose the model to use from the list.
5. Press **Save Settings**.

> **Tip**
> The settings here are shared with the **A (AI TOOL)** tab of the WS Library on the ComfyUI side.
> On the other hand, the Prompt tab (Chapter 7) and the Tagger tab each have their own **gear button** settings.
> If "it works in the AI TOOL tab but the Prompt tab says Disconnected", set the same thing with the gear button in the Prompt tab as well.

> **If it does not connect well**
> - Check that software such as Ollama is running.
> - For LM Studio, you need to **start the server** inside the app.
> - Check that the port number in the address matches the software's settings.
> - If the model list is empty, check that the model has been downloaded.

### Translate
1. Choose the source and target languages (swap them with the **swap** button).
2. Write the text in the input box and press **Translate**.
3. **Copy** the result and paste it into GenerateUI or a preset.

> **Tip**
> Small models sometimes return the original text as it is without translating.
> In that case a message says the model returned the original text, so try another model.

### Chat
Talk in the input box and send with **Enter** (**Shift + Enter** for a line break).
It remembers the flow of the conversation, so follow-up requests such as "make it a brighter mood" also work.
**Clear** resets the conversation.

> **Tip: generating images from chat (advanced)**
> If you use a model that supports "Tool Calling",
> just asking in chat "draw a cat" generates an image with the workflow loaded in GenerateUI, and it is shown inside the chat.
> This feature can be turned on or off with the **Allow image generation** check next to the input box.

### TOOLS - reading images (VLM)
With a model that supports image input (a VLM), you can have the AI read the contents of an image.

1. Drop an image (PNG / JPG / WebP) into the **TOOLS** frame.
2. Choose a task.

   | Task | Contents |
   | --- | --- |
   | Describe | Explains in text what is in the image |
   | Create prompt | Makes a prompt for reproducing the image |
   | Create tags | Writes out the elements of the image in tag format |
   | Create wildcards | Makes candidate wildcard lists by specifying a category name and count (no image needed) |

3. Press **Run**. You can copy the result and use it.

> **Example**
> When you want to imitate the mood of an illustration you like, run "Create prompt" on that image
> and try the resulting prompt in GenerateUI - you can use it like that.

### It can be used inside the ComfyUI screen too
The same AI features can also be used in the **A** tab of the WS Library on the ComfyUI side.
Handy when you want to translate something briefly while working on the node screen.

---

## 10-3 Freeing VRAM and managing memory

As touched on in 10-1, local AI and image generation compete for GPU memory (VRAM).
Ollama keeps a model that has been used in memory for a while,
so if you generate images after using the AI, memory may run short.

### Freeing manually
Pressing **Unload Model** in the AI TOOL settings takes the AI model out of memory and frees VRAM.
(With Ollama, all loaded models are unloaded)

### Freeing automatically before generation
In **VRAM Management (Ollama)** in the Settings tab, you can set Ollama's models to be unloaded automatically just before image generation.

| Behavior before generation | What it does |
| --- | --- |
| Do nothing | Does not unload automatically |
| Unload what is needed only when free memory is below the target | Unloads only when free VRAM is less than the **Target free VRAM (GB)** |
| Unload everything every time | Always unloads everything at every generation |

> **Tip**
> If you can't decide which to choose, "Unload what is needed only when free memory is below the target" is recommended.
> For the target free VRAM, enter a rough value of the amount of memory image generation needs (it differs by the model you use).
> The **Unload all now** button can also free it immediately, on the spot.

> **Caution**
> This automatic unloading applies to Ollama only. If you use LM Studio or similar, free memory manually.

---

## 10-4 Security notes

### By default it connects only to AI on "your own computer"
For safety, the AI software Workflow Studio connects to (Ollama, LM Studio and so on) is by default limited to
**software running inside the same computer (localhost / 127.0.0.1)**.

### When you want to use AI on another computer
If you want to run Ollama on another computer on your home LAN (such as a computer with a strong GPU) and use it,
register the address of the computer you want to connect to in the environment variable **`WFS_ALLOWED_BACKEND_HOSTS`**, and restart ComfyUI.

```
WFS_ALLOWED_BACKEND_HOSTS=192.168.1.20:11434
```

If there are several, list them separated by commas (,).
How to set environment variables differs depending on how you start ComfyUI.

### If you start ComfyUI with `--listen`
If you start ComfyUI with the `--listen` option, other computers and smartphones on the same network
can also access ComfyUI (and Workflow Studio).
In that case, anyone who can access it can use your AI software and images.

> **Caution**
> Use `--listen` **only on a trusted network**, such as a home LAN.
> Do not use it in cafes or on public Wi-Fi.

> **Summary of this chapter**
> - If you prepare local AI (Ollama and so on), you can translate, chat and read images. What you type is not sent outside
> - In the AI TOOL tab's settings, choose the backend, address and model, and test the connection
> - The Prompt tab and Tagger tab have separate gear-button settings
> - AI and image generation compete for VRAM. Free it with "Unload Model" or "VRAM Management (Ollama)"
> - By default it connects only to AI on your own computer. Use `--listen` only on a trusted network
