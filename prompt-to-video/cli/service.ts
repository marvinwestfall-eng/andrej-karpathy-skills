import * as fs from "fs";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "../src/lib/constants";

let leonardoApiKey: string | null = null;

export const setLeonardoApiKey = (key: string) => {
  leonardoApiKey = key;
};

const LEONARDO_MODEL_ID = "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3"; // Leonardo Phoenix

export const generateAiImage = async ({
  prompt,
  path,
  onRetry,
}: {
  prompt: string;
  path: string;
  onRetry: (attempt: number) => void;
}) => {
  const genRes = await fetch(
    "https://cloud.leonardo.ai/api/rest/v1/generations",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${leonardoApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        modelId: LEONARDO_MODEL_ID,
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        num_images: 1,
      }),
    },
  );

  if (!genRes.ok)
    throw new Error(`Leonardo error: ${await genRes.text()}`);

  const genData = await genRes.json();
  const generationId = genData.sdGenerationJob.generationId;

  // Poll until complete (max ~90s)
  for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const statusRes = await fetch(
      `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
      { headers: { Authorization: `Bearer ${leonardoApiKey}` } },
    );
    const statusData = await statusRes.json();
    const gen = statusData.generations_by_pk;

    if (gen.status === "COMPLETE") {
      const imageUrl = gen.generated_images[0].url;
      const imgRes = await fetch(imageUrl);
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      fs.writeFileSync(path, buffer);
      return;
    }

    if (gen.status === "FAILED") {
      onRetry(i + 1);
      throw new Error("Leonardo generation failed");
    }
  }

  throw new Error("Leonardo generation timed out");
};
