# generate_image

The `generate_image` tool creates new images from text prompts or modifies existing images using AI models. It supports two providers: **OpenRouter** and the **AI Code Orchestrator provider**. This experimental feature enables visual content generation and transformation within your development workflow.

---

## Parameters

The tool accepts these parameters:

- `prompt` (required): The text description of what to generate or how to edit the image.
- `path` (required): The file path where the generated/edited image should be saved (relative to the workspace). The tool automatically adds the appropriate extension if not provided.
- `image` (optional): The file path to an input image to edit or transform (relative to the workspace). Supported formats: PNG, JPG, JPEG, GIF, WEBP.

---

## What It Does

This tool generates images from text descriptions or applies transformations to existing images using AI models. When no input image is provided, it creates new images from scratch. When an input image is provided, it applies the prompt as editing instructions to transform the image.

---

## When is it used?

- When creating visual assets for documentation, mockups, or prototypes
- When generating placeholder images or illustrations
- When transforming existing images (style transfer, enhancement, modifications)
- When creating diagrams or visual explanations from descriptions
- When prototyping UI elements visually

---

## Key Features

- **Text-to-image generation**: Create images from descriptive prompts
- **Image-to-image transformation**: Edit or transform existing images
- Supports multiple input formats (PNG, JPG, JPEG, GIF, WEBP)
- Automatic file extension handling
- Powered by **OpenRouter** or the **AI Code Orchestrator provider** for access to various AI models
- Experimental feature with ongoing improvements

---

## Limitations

- Requires OpenRouter or AI Code Orchestrator provider API configuration
- Image quality depends on the AI model and prompt quality
- Generation time varies based on complexity and model
- Experimental feature: behavior may change in future releases
- API usage may incur costs based on OpenRouter pricing
- Some image transformations may not produce expected results

---

## How It Works

When the `generate_image` tool is invoked, it follows this process:

1. **Parameter Validation**: Validates required `prompt` and `path` parameters.
2. **Mode Selection**:
    - If `image` parameter is provided: operates in **edit mode** (transform existing image)
    - Otherwise: operates in **generation mode** (create new image from prompt)
3. **API Request**: Sends request to the configured provider (OpenRouter or AI Code Orchestrator) with prompt and optional input image.
4. **Image Processing**: Receives generated/edited image from the API.
5. **File Saving**: Saves the image to the specified `path` with appropriate extension.
6. **Feedback**: Reports success and the location of the generated image.

---

## Usage Examples

Generating a new image:

```json
{
	"prompt": "A beautiful sunset over mountains with vibrant orange and purple colors",
	"path": "images/sunset.png"
}
```

Editing an existing image:

```json
{
	"prompt": "Transform this image into a watercolor painting style",
	"path": "images/watercolor-output.png",
	"image": "images/original-photo.jpg"
}
```

Upscaling and enhancing:

```json
{
	"prompt": "Upscale this image to higher resolution, enhance details, improve clarity and sharpness while maintaining the original content and composition",
	"path": "images/enhanced-photo.png",
	"image": "images/low-res-photo.jpg"
}
```

---

## Relation to Features

The `generate_image` tool is the programmatic interface to the [Image Generation](../../features/image-generation.md) feature. For comprehensive documentation on configuration, model selection, API setup, and advanced usage, see the [Image Generation feature documentation](../../features/image-generation.md).

---

## Configuration

Image generation requires OpenRouter API configuration. See the [Image Generation](../../features/image-generation.md) feature page for detailed setup instructions including:

- OpenRouter API key configuration
- Model selection and capabilities
- Best practices for prompts
- Troubleshooting and limitations
