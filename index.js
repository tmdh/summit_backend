const { AzureKeyCredential, TextAnalysisClient } = require("@azure/ai-language-text");
const express = require("express");
const multer = require("multer");
const pdf2md = require('@opendocsg/pdf2md');
const mammoth = require("mammoth");

const fs = require('fs')

const endpoint = process.env["ENDPOINT"];
const apiKey = process.env["LANGUAGE_API_KEY"];
const port = process.env.PORT || 3000;

async function textSummary(text) {
  const client = new TextAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  const actions = [
    {
      kind: "ExtractiveSummarization",
      maxSentenceCount: 2,
    },
  ];
  const poller = await client.beginAnalyzeBatch(actions, [text], "en");

  poller.onProgress(() => {
    console.log(
      `Last time the operation was updated was on: ${poller.getOperationState().modifiedOn}`
    );
  });

  const results = await poller.pollUntilDone();

  for await (const actionResult of results) {
    if (actionResult.kind !== "ExtractiveSummarization") {
      throw new Error(`Expected extractive summarization results but got: ${actionResult.kind}`);
    }
    if (actionResult.error) {
      const { code, message } = actionResult.error;
      throw new Error(`Unexpected error (${code}): ${message}`);
    }
    for (const result of actionResult.results) {
      if (result.error) {
        const { code, message } = result.error;
        throw new Error(`Unexpected error (${code}): ${message}`);
      }
      return result.sentences.map((sentence) => sentence.text).join("\n");
    }
  }
}


const app = express();
app.use(express.json());

app.post('/text', async (req, res) => {
  const {text} = req.body;
  console.log(text);
  const summary = await textSummary(text, res);
  res.json({summary});
})

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

const upload = multer({ storage });

app.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const filename = req.file.filename;
  if (filename.endsWith("pdf")) {
    const pdfBuffer = fs.readFileSync('uploads/' + filename);
    const text = await pdf2md(pdfBuffer);
    const summary = await textSummary(text, res);
    res.json({summary});
  } else if (filename.endsWith("docx")) {
    const {value} = await mammoth.extractRawText({path: 'uploads/' + filename});
    const summary = await textSummary(value, res);
    res.json({summary});
  } else {
    res.json({ summary: 'File not supported' });
  }
});

app.get("/", (req, res) => {
  res.json({'hello': 'world'});
})

app.listen(port, () => {
  console.log("server started")
})