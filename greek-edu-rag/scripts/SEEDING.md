# Pinecone Seeding

Διαδικασία πλήρωσης του Pinecone index με ΑΠΣ excerpts για το RAG pipeline.

## Quick start

```bash
cd greek-edu-rag

# 1. Env vars
export OPENAI_API_KEY=sk-…
export PINECONE_API_KEY=pc-…
export PINECONE_INDEX_NAME=eduprompt-rag   # optional

# 2. Dry-run (validate + chunk, no API calls)
python scripts/seed_pinecone.py \
  --input scripts/data/sample_curriculum.jsonl \
  --dry-run

# 3. Real run (creates index first time)
python scripts/seed_pinecone.py \
  --input scripts/data/sample_curriculum.jsonl \
  --namespace curriculum \
  --bootstrap

# 4. Incremental (append new entries)
python scripts/seed_pinecone.py \
  --input scripts/data/my_new_entries.jsonl \
  --namespace curriculum
```

## Input format

JSONL — ένα JSON object ανά γραμμή. Κενές γραμμές και γραμμές που
αρχίζουν με `#` αγνοούνται.

```json
{
  "grade": "Δ",
  "subject": "Μαθηματικά",
  "unit": "Κλάσματα",
  "chapter": "Ισοδύναμα κλάσματα",
  "source": "ΑΠΣ-2021-Δ-ΜΑΘ-Κλασματα-p47",
  "text": "Οι μαθητές αναγνωρίζουν…"
}
```

Required fields: `grade`, `subject`, `source`, `text`.

`source` πρέπει να είναι **unique per document**. Ο script παράγει
deterministic vector IDs από `sha1(source + chunk_index)` ώστε οι
re-runs να κάνουν upsert overwrite αντί για duplicates.

## Chunking

- Text μέχρι 1000 chars → ένα chunk.
- Μεγαλύτερα κείμενα → chunks ~1000 chars με 150 chars overlap,
  word-aware (δεν σπάει λέξη).
- Chunks < 60 chars αγνοούνται (headers, κενά).

## Validation

- `grade` πρέπει να είναι {Α, Β, Γ, Δ, Ε, ΣΤ}
- `subject` είναι warning αν δεν είναι στο standard whitelist, αλλά
  προχωράει.
- Entries χωρίς required fields γίνονται skip με warning.

## Index configuration

Όταν τρέχεις με `--bootstrap`, ο script δημιουργεί:

- **Name**: `eduprompt-rag` (ή `PINECONE_INDEX_NAME`)
- **Dimension**: 1536 (text-embedding-3-small)
- **Metric**: cosine
- **Spec**: Serverless, cloud=aws, region=us-east-1 (ή
  `PINECONE_CLOUD` / `PINECONE_REGION`)

## Namespaces

Δύο namespaces χρησιμοποιούνται από το `rag_retriever.py`:

| Namespace | Περιεχόμενο | Αναζητείται από |
|-----------|-------------|-----------------|
| `curriculum` | ΑΠΣ excerpts (official) | `search_curriculum()` |
| `scenarios` | Past high-quality σενάρια | `search_similar_scenarios()` |

Ο seeder δουλεύει με το ίδιο JSONL format και για τα δύο. Για
`scenarios`, πρόσθεσε στο metadata `quality_score` (0-1).

## Παρακολούθηση κόστους

Το `text-embedding-3-small` κοστίζει ~$0.02 / 1M tokens.
Σε ~5.000 chunks των 500 tokens = ~$0.05. Αμελητέο.

## Troubleshooting

**"PINECONE_API_KEY missing"**
→ `echo $PINECONE_API_KEY` — σιγουρέψου ότι το έχεις export-άρει στο shell.

**"Index creation timeout"**
→ Pinecone serverless μερικές φορές χρειάζεται 30+ δευτερόλεπτα.
Το script συνεχίζει — απλά retry το seeding αν αποτύχει.

**"Upsert batch failed"**
→ Ένας retry γίνεται ήδη. Αν συνεχίσει, πιθανόν rate limit — κάνε
split το input σε μικρότερα αρχεία.

**Duplicate IDs μετά από rename source**
→ Αν άλλαξες το `source` ενός entry, το παλιό vector μένει στο index.
Delete manually από Pinecone console ή κάλεσε:
```python
index.delete(ids=["doc-xxxx"], namespace="curriculum")
```

## Dependencies

```
openai>=1.0
pinecone>=5.0   # NB: το παλιό πακέτο "pinecone-client" έχει καταργηθεί
```

(Πρόσθεσέ τα στο `requirements.txt` αν δεν υπάρχουν ήδη.)
