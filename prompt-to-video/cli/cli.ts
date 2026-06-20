#!/usr/bin/env node

import prompts from "prompts";
import ora from "ora";
import chalk from "chalk";
import * as dotenv from "dotenv";
import { generateAiImage, setLeonardoApiKey } from "./service";
import { StoryMetadataWithDetails } from "../src/lib/types";
import * as fs from "fs";
import * as path from "path";
import { createTimeLineFromStoryWithDetails } from "./timeline";

dotenv.config({ quiet: true });

const getContentDir = (slug: string) =>
  path.join(process.cwd(), "public", "content", slug);

const getImagePath = (slug: string, uid: string) =>
  path.join(getContentDir(slug), "images", `${uid}.png`);

const getTimelinePath = (slug: string) =>
  path.join(getContentDir(slug), "timeline.json");

async function generate() {
  // Find available slugs
  const contentRoot = path.join(process.cwd(), "public", "content");
  const slugs = fs.existsSync(contentRoot)
    ? fs.readdirSync(contentRoot).filter((d) => {
        const descriptorPath = path.join(contentRoot, d, "descriptor.json");
        return fs.existsSync(descriptorPath);
      })
    : [];

  if (slugs.length === 0) {
    console.log(
      chalk.red(
        "No descriptor.json found in public/content/. Ask Claude to generate one first.",
      ),
    );
    process.exit(1);
  }

  let slug: string;

  if (slugs.length === 1) {
    slug = slugs[0];
    console.log(chalk.blue(`Using: ${slug}`));
  } else {
    const { chosen } = await prompts({
      type: "select",
      name: "chosen",
      message: "Which story to generate images for?",
      choices: slugs.map((s) => ({ title: s, value: s })),
    });
    if (!chosen) process.exit(1);
    slug = chosen;
  }

  const descriptorPath = path.join(getContentDir(slug), "descriptor.json");
  const descriptor: StoryMetadataWithDetails = JSON.parse(
    fs.readFileSync(descriptorPath, "utf-8"),
  );

  let leonardoKey = process.env.LEONARDO_API_KEY;
  if (!leonardoKey) {
    const { key } = await prompts({
      type: "password",
      name: "key",
      message: "Enter your Leonardo API key:",
      validate: (v) => v.length > 0 || "Required",
    });
    if (!key) process.exit(1);
    leonardoKey = key;
  }

  setLeonardoApiKey(leonardoKey!);

  fs.mkdirSync(path.join(getContentDir(slug), "images"), { recursive: true });

  const spinner = ora("Generating images with Leonardo...").start();

  for (let i = 0; i < descriptor.content.length; i++) {
    const item = descriptor.content[i];
    const imagePath = getImagePath(slug, item.uid);

    if (fs.existsSync(imagePath)) {
      spinner.text = `[${i + 1}/${descriptor.content.length}] Skipping existing image for segment ${i + 1}`;
      continue;
    }

    spinner.text = `[${i + 1}/${descriptor.content.length}] Generating image for segment ${i + 1}`;
    await generateAiImage({
      prompt: item.imageDescription,
      path: imagePath,
      onRetry: (attempt) => {
        spinner.text = `[${i + 1}/${descriptor.content.length}] Retry ${attempt} for segment ${i + 1}`;
      },
    });
  }

  spinner.succeed(chalk.green("Images generated!"));

  const timelineSpinner = ora("Building timeline...").start();
  const timeline = createTimeLineFromStoryWithDetails(descriptor);
  fs.writeFileSync(getTimelinePath(slug), JSON.stringify(timeline, null, 2));
  timelineSpinner.succeed(chalk.green("Timeline built!"));

  console.log(chalk.green.bold("\n✨ Done!\n"));
  console.log("Run " + chalk.blue("npm run dev") + " to preview");
}

generate().catch((err) => {
  console.error(chalk.red("\n❌ Error:"), err);
  process.exit(1);
});
