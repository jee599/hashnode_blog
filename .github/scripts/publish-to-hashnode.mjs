import { readFileSync } from "fs";

const API_URL = "https://gql.hashnode.com";
const TOKEN = process.env.HASHNODE_TOKEN;
const PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;
const CHANGED_FILES = process.env.CHANGED_FILES?.trim();

if (!TOKEN || !PUBLICATION_ID) {
  console.error("Missing HASHNODE_TOKEN or HASHNODE_PUBLICATION_ID");
  process.exit(1);
}

if (!CHANGED_FILES) {
  console.log("No files to publish");
  process.exit(0);
}

// Parse frontmatter from markdown
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Invalid frontmatter");

  const frontmatter = {};
  const lines = match[1].split("\n");

  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Handle array values like [ai, productivity, claude]
    if (value.startsWith("[") && value.endsWith("]")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim());
    }
    // Handle quoted strings
    else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Handle booleans
    else if (value === "true") value = true;
    else if (value === "false") value = false;

    frontmatter[key] = value;
  }

  return { frontmatter, content: match[2].trim() };
}

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

// Check if a post with this slug already exists
async function getPostBySlug(slug) {
  const query = `
    query GetPost($publicationId: ObjectId!, $slug: String!) {
      publication(id: $publicationId) {
        post(slug: $slug) {
          id
          title
          slug
        }
      }
    }
  `;
  const data = await gql(query, { publicationId: PUBLICATION_ID, slug });
  return data?.publication?.post ?? null;
}

// Create a new post
async function createPost(frontmatter, markdown) {
  const tags = (frontmatter.tags || []).map((t) => ({
    name: t,
    slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  }));

  const input = {
    publicationId: PUBLICATION_ID,
    title: frontmatter.title,
    subtitle: frontmatter.subtitle || undefined,
    slug: frontmatter.slug,
    contentMarkdown: markdown,
    tags,
    coverImageOptions: frontmatter.cover
      ? { coverImageURL: frontmatter.cover }
      : undefined,
    originalArticleURL: frontmatter.canonical || undefined,
    settings: {
      enableTableOfContent: frontmatter.enableToc === true,
    },
  };

  const query = `
    mutation PublishPost($input: PublishPostInput!) {
      publishPost(input: $input) {
        post {
          id
          url
          slug
          title
        }
      }
    }
  `;

  const data = await gql(query, { input });
  return data.publishPost.post;
}

// Update an existing post
async function updatePost(postId, frontmatter, markdown) {
  const tags = (frontmatter.tags || []).map((t) => ({
    name: t,
    slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  }));

  const input = {
    id: postId,
    title: frontmatter.title,
    subtitle: frontmatter.subtitle || undefined,
    slug: frontmatter.slug,
    contentMarkdown: markdown,
    tags,
    coverImageOptions: frontmatter.cover
      ? { coverImageURL: frontmatter.cover }
      : undefined,
    originalArticleURL: frontmatter.canonical || undefined,
    settings: {
      enableTableOfContent: frontmatter.enableToc === true,
    },
  };

  const query = `
    mutation UpdatePost($input: UpdatePostInput!) {
      updatePost(input: $input) {
        post {
          id
          url
          slug
          title
        }
      }
    }
  `;

  const data = await gql(query, { input });
  return data.updatePost.post;
}

// Main
const files = CHANGED_FILES.split(" ").filter(Boolean);

for (const file of files) {
  console.log(`\n--- Processing: ${file} ---`);

  try {
    const raw = readFileSync(file, "utf-8");
    const { frontmatter, content } = parseFrontmatter(raw);

    if (!frontmatter.title || !frontmatter.slug) {
      console.error(`Skipping ${file}: missing title or slug in frontmatter`);
      continue;
    }

    const existing = await getPostBySlug(frontmatter.slug);

    if (existing) {
      console.log(`Post exists (id: ${existing.id}), updating...`);
      const post = await updatePost(existing.id, frontmatter, content);
      console.log(`Updated: ${post.title} -> ${post.url}`);
    } else {
      console.log(`Creating new post: "${frontmatter.title}"`);
      const post = await createPost(frontmatter, content);
      console.log(`Published: ${post.title} -> ${post.url}`);
    }
  } catch (err) {
    console.error(`Failed to publish ${file}:`, err.message);
    process.exit(1);
  }
}

console.log("\nDone.");
