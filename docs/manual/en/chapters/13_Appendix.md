# Appendix

## Appendix A Glossary

The main terms that appear in this book, in alphabetical order.

| Term | Meaning | In this book |
| --- | --- | --- |
| API format / UI format | The save format of a workflow. UI format includes things such as node positions; API format contains only the processing content | Chapter 4 |
| Apply | The button in GenerateUI that reflects changed values into the workflow | Chapter 5 |
| Badge | A colored label attached to a workflow or model | Chapter 4 |
| Batch generation | Automatically generating in bulk while changing conditions | Chapter 5 |
| Canvas | The work space where nodes are laid out on ComfyUI's node screen | Chapter 3 |
| CFG | How strongly to follow the prompt | Chapter 5 |
| Checkpoint | The model that forms the core of image generation | Chapter 6 |
| Civitai | A sharing site for image-generation models | Chapter 6 |
| ComfyUI Manager | A management tool for searching for and installing custom nodes | Chapter 2 |
| Custom node | A node or extension added to ComfyUI afterwards. Workflow Studio is one of them | Chapter 1 |
| Denoise | How strongly to redraw the original image | Chapter 5 |
| Embedding | A small file that teaches a particular word a meaning | Chapter 6 |
| Hash value | A "fingerprint"-like value computed from a file's contents. Used to look up models on Civitai | Chapter 6 |
| I2I (Image to Image) | Making a new image based on an image | Chapter 5 |
| Inpainting | Redrawing only part of an image (the masked part) | Chapter 11 |
| JSON | The data format used to save workflows | Chapter 1 |
| Keyframe | In Lab, a specification of "from which run to switch settings" | Chapter 5 |
| Local AI | AI that runs inside your own computer (such as Ollama) | Chapter 10 |
| LoRA | A small model that teaches an art style, character and so on as an add-on | Chapter 6 |
| Mask | A specification of the part of an image to be processed | Chapter 11 |
| Metadata | Information embedded in an image, such as the settings used at generation | Chapter 8 |
| Model | The file that acts as the "AI brain" that makes images | Chapter 1 |
| Negative prompt | A prompt where you write what you do not want drawn | Chapter 7 |
| Node | A "box" arranged on ComfyUI's screen. It handles one process | Chapter 1 |
| Node set | Several nodes and their connections saved together | Chapter 9 |
| Ollama | Software for running local AI easily | Chapter 10 |
| Port number | A number for distinguishing which software to communicate with inside one computer | Chapter 2 |
| Positive prompt | A prompt where you write what you want drawn | Chapter 7 |
| Preset | A pair of positive and negative prompts saved together | Chapter 7 |
| Prompt | The text that tells the AI "what kind of image you want" | Chapter 1 |
| Queue | The reservation list for generation. Processed in order | Chapter 1 |
| Sampler | The algorithm used when drawing an image (such as euler) | Chapter 5 |
| Scheduler | How the drawing amount is distributed across steps | Chapter 5 |
| Seed | The seed of random numbers an image grows from. If the same, you get almost the same image | Chapter 5 |
| Semantic search | Searching images by the "meaning" of a sentence or image. Used with the Gallery's S button | Chapter 8 |
| Steps | The number of times drawing is repeated | Chapter 5 |
| Style | A mood template added to a prompt | Chapter 7 |
| T2I (Text to Image) | Making an image from text (a prompt) | Chapter 5 |
| Trigger word | A word to put in the prompt to bring out a LoRA's effect | Chapter 6 |
| VAE | The model that finishes an image's colors and fine details | Chapter 6 |
| VLM | An AI model that can read images | Chapter 10 |
| VRAM | The memory of the GPU (graphics card) | Chapter 10 |
| Wildcard | A mechanism that randomly swaps a part of the prompt at every generation | Chapter 7 |
| Workflow | The whole flow of processing made by connecting nodes with lines | Chapter 1 |
| WS Library | Workflow Studio's side panel that opens beside ComfyUI's node screen | Chapter 9 |

---

## Appendix B Keyboard and mouse operations

### General
| Operation | What happens |
| --- | --- |
| Esc | Closes the open screen (modal or panel) |
| Enter | Confirms a rename / sends a chat message |
| Shift + Enter | Line break in chat |
| Double-click | Opens the detail screen (workflows, models and so on) |
| Shift + click (W button) | Opens Workflow Studio in a new window |

### GenerateUI
| Operation | What happens |
| --- | --- |
| Alt + click (Apply) | Reflects the values and generates at once |
| Ctrl + Up/Down (prompt field) | Raises or lowers the emphasis `(word:number)` of the selected word by 0.05 |
| Enter / Shift + Enter (Raw JSON search box) | Moves to the next / previous match |

### Gallery
| Operation | What happens |
| --- | --- |
| Ctrl + click | Select several images |
| Alt + click | Open the image in the Metadata subtab |
| Enter (when semantic search is on) | Run a semantic search with the text in the search box |

### WS Library
| Operation | What happens |
| --- | --- |
| Drag and drop | Place or load at the dropped position on the canvas |
| Double-click | Place or load near the center of the canvas |
| Alt + click (N tab) | Switch a node's favorite on or off |

### Image Edit
| Operation | What happens |
| --- | --- |
| V / B / T / S / G | Switch to the Select / Draw / Text / Shape / Fill tool |
| Ctrl + Z / Ctrl + Y | Undo / redo |
| Mouse wheel | Zoom in and out |
| Space + drag | Move the view position |
| Delete | Delete the selected layer (when there are two or more layers) |

---

## Appendix C Reference links

### Workflow Studio
- GitHub (latest version, release notes, bug reports)
  https://github.com/ketle-man/ComfyUI-Workflow-Studio

### ComfyUI itself and management tools
- ComfyUI
  https://github.com/comfyanonymous/ComfyUI
- ComfyUI Manager
  https://github.com/Comfy-Org/ComfyUI-Manager

### Related software and services introduced in this book
| Name | Use | In this book |
| --- | --- | --- |
| Civitai (https://civitai.com/) | Getting models, fetching information | Chapter 6 |
| Ollama (https://ollama.com/) | Local AI | Chapter 10 |
| LM Studio (https://lmstudio.ai/) | Local AI | Chapter 10 |
| Lemonade Server (https://lemonade-server.ai/) | Local AI | Chapter 10 |
| Eagle (https://eagle.cool/) | Image-management software | Chapter 8 |

### Custom nodes that are handy to use together
| Name | Use | In this book |
| --- | --- | --- |
| ComfyUI Comic Creator (https://github.com/ketle-man/comfyui-comic-creator) | Manga making. Works with the Gallery and image generation | Chapter 11 |
| comfyui-image-feeder (https://github.com/ketle-man/comfyui-image-feeder) | Feeder's Image Loop mode | Chapter 5 |
| comfyui-mask-editor-one (https://github.com/ketle-man/comfyui-mask-editor-one) | Advanced masking and background removal in Image Edit | Chapter 11 |
| ComfyUI-Impact-Pack (https://github.com/ltdrdata/ComfyUI-Impact-Pack) | Curly-brace-style wildcards | Chapter 7 |
| ComfyUI-Lora-Manager | Managing LoRAs; placing LoRAs together from the WS Library | Chapter 9 |

> **Caution**
> The contents and URLs of linked pages may change.
