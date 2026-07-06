const fs = require('fs');
const path = require('path');

const DEFAULT_KNOWLEDGE_DIR = path.join(__dirname, 'knowledge');

class KnowledgeLoader {
  constructor(options = {}) {
    this.dir = options.dir || process.env.AI_CONSULTANT_KNOWLEDGE_DIR || DEFAULT_KNOWLEDGE_DIR;
  }

  listDocuments() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((file) => file.endsWith('.md'))
      .sort()
      .map((file) => {
        const fullPath = path.join(this.dir, file);
        const body = fs.readFileSync(fullPath, 'utf8').trim();
        return {
          id: file.replace(/\.md$/, ''),
          title: firstHeading(body) || file,
          body,
          updatedAt: extractUpdatedAt(body),
        };
      });
  }

  search(query, limit = 3) {
    const terms = tokenize(query);
    if (!terms.length) return [];
    return this.listDocuments()
      .map((doc) => ({
        ...doc,
        score: scoreDocument(doc, terms),
      }))
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
}

function scoreDocument(doc, terms) {
  const haystack = `${doc.title}\n${doc.body}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function tokenize(value = '') {
  return String(value)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((term) => term.trim())
    .filter((term) => term.length >= 3);
}

function firstHeading(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractUpdatedAt(markdown) {
  const match = markdown.match(/Актуально:\s*([0-9-]+)/i);
  return match ? match[1] : null;
}

module.exports = { KnowledgeLoader, DEFAULT_KNOWLEDGE_DIR };
