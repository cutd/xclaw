# Phase 4: Memory Auto-Extraction Design

## Goal

Add automatic memory extraction to xclaw's existing memory system. During conversations, the system detects worth-remembering information using lightweight heuristics, then uses an LLM to extract structured memories from flagged messages. Extraction is async and non-blocking — it never slows down responses.

## Approach: Heuristic Trigger + LLM Extraction

Two-stage pipeline: fast regex heuristics filter candidates, then a cheap LLM call extracts structured data from those candidates only. This keeps token costs near zero for most messages while ensuring high-quality extraction when it matters.

## Heuristic Trigger

`packages/core/src/memory/heuristic.ts`

A `MemoryHeuristic` class scans each user message for patterns that suggest extractable information. Returns a confidence flag and candidate category.

| Category | Trigger patterns |
|----------|-----------------|
| user_preference | `i prefer`, `i like`, `i hate`, `always use`, `never use`, `i want`, `don't like` |
| profile_info | `my name is`, `i work at`, `i'm a`, `i am a`, `my timezone`, `i live in`, `my email` |
| decision | `we decided`, `let's go with`, `i chose`, `switched to`, `we agreed`, `going with` |
| factual_knowledge | `the api is`, `endpoint is`, `password is in`, `project uses`, `deploy to`, `config is`, `stored in` |

If any pattern matches, the message pair is flagged. The heuristic assigns a category tag for the downstream LLM extraction. Pure function, no dependencies.

## LLM Extractor

`packages/core/src/memory/extractor.ts`

A `MemoryExtractor` class receives flagged message pairs and calls a lightweight model to extract structured memories.

Prompt template:

```
Extract any worth-remembering information from this conversation exchange.
Categories: user_preference, profile_info, decision, factual_knowledge

Return a JSON array of extracted memories:
[{"content": "...", "category": "...", "importance": 0.0-1.0}]

If nothing is worth remembering, return [].

User: {userMessage}
Assistant: {assistantResponse}
```

Model selection uses tier `lightweight` via the existing ModelRouter. Output is an array of `ExtractedMemory` objects, each mapped to a `CreateMemoryInput` and stored via `MemoryManager.store()`.

Error handling: if the LLM call fails or returns unparseable JSON, silently drop. Memory extraction is best-effort, never blocks the pipeline.

## Pipeline Integration

The extractor hooks into `MessagePipeline` as an async post-processing step:

```
6.  Context: record response
6b. Memory: store daily log          (existing)
6c. Memory: extract & store          (NEW — async, fire-and-forget)
7.  Audit
return result                        (does NOT wait for 6c)
```

Step 6c fires off extraction but does not await it. The pipeline returns immediately. If extraction fails, it's silently caught.

`MessagePipelineConfig` gets an optional `memoryExtractor?: MemoryExtractor` field, matching the existing optional `memoryManager` pattern.

Data flow:

```
pipeline.process()
  -> result = dispatcher.dispatch(...)
  -> fire-and-forget: memoryExtractor.process(userMessage, result.content, sessionId, userId)
      -> heuristic.scan(userMessage) -> candidates?
          -> no: skip
          -> yes: llmExtract(userMessage, result.content, category)
              -> memories[] -> memoryManager.store() for each
  -> return result
```

## Testing

- `heuristic.test.ts` — Pattern matching per category, no false positives, edge cases (mid-sentence, mixed case)
- `extractor.test.ts` — Mocked LLM provider, JSON parsing, malformed output handling, empty extraction
- `extraction-integration.test.ts` — Full flow: heuristic + extractor + MemoryManager with mocked LLM, verify a message like "I prefer TypeScript" triggers detection, extraction, and storage

No changes to existing tests. The extractor is optional in pipeline config.

## Implementation Order

1. Heuristic trigger (heuristic.ts + tests)
2. LLM extractor (extractor.ts + tests)
3. Pipeline integration (modify pipeline.ts, add optional config)
4. Integration tests
