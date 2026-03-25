"""WFS_PromptText – Prompt preset node with positive/negative STRING outputs."""


class WFS_PromptText:
    """Outputs positive and negative prompt strings."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "positive": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Positive prompt...",
                }),
                "negative": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "placeholder": "Negative prompt...",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "execute"
    CATEGORY = "Workflow Studio"
    OUTPUT_NODE = False

    def execute(self, positive, negative):
        return (positive, negative)
