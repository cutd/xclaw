export interface BM25Result {
  id: string;
  score: number;
}

interface Document {
  id: string;
  terms: string[];
  termFreqs: Map<string, number>;
  length: number;
}

/**
 * BM25 keyword search index.
 * Implements Okapi BM25 ranking with k1=1.5, b=0.75.
 */
export class BM25Index {
  private docs = new Map<string, Document>();
  private avgDocLength = 0;
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  add(id: string, text: string): void {
    const terms = this.tokenize(text);
    const termFreqs = new Map<string, number>();
    for (const term of terms) {
      termFreqs.set(term, (termFreqs.get(term) ?? 0) + 1);
    }
    this.docs.set(id, { id, terms, termFreqs, length: terms.length });
    this.updateAvgLength();
  }

  remove(id: string): void {
    this.docs.delete(id);
    this.updateAvgLength();
  }

  search(query: string, limit = 10): BM25Result[] {
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores: BM25Result[] = [];
    const N = this.docs.size;

    for (const doc of this.docs.values()) {
      let score = 0;
      for (const term of queryTerms) {
        const tf = doc.termFreqs.get(term) ?? 0;
        if (tf === 0) continue;

        const df = this.documentFrequency(term);
        const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
        const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (doc.length / this.avgDocLength)));
        score += idf * tfNorm;
      }
      if (score > 0) {
        scores.push({ id: doc.id, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit);
  }

  private documentFrequency(term: string): number {
    let count = 0;
    for (const doc of this.docs.values()) {
      if (doc.termFreqs.has(term)) count++;
    }
    return count;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);
  }

  private updateAvgLength(): void {
    if (this.docs.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const doc of this.docs.values()) {
      total += doc.length;
    }
    this.avgDocLength = total / this.docs.size;
  }
}
