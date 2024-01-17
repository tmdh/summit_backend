const { AzureKeyCredential, TextAnalysisClient } = require("@azure/ai-language-text");
const express = require("express");
const multer = require("multer");
const pdf = require("pdf-extraction");
const mammoth = require("mammoth");
const {HfInference} = require("@huggingface/inference");

const fs = require('fs')

const endpoint = process.env["ENDPOINT"];
const apiKey = process.env["LANGUAGE_API_KEY"];
const hfKey = process.env["HF_KEY"];
const port = process.env.PORT || 3000;

const inference = new HfInference(hfKey);

/*
async function textSummary(text) {
  const client = new TextAnalysisClient(endpoint, new AzureKeyCredential(apiKey));
  const actions = [
    {
      kind: "ExtractiveSummarization",
      maxSentenceCount: 5,
    },
  ];
  const poller = await client.beginAnalyzeBatch(actions, [text], "en");

  poller.onProgress(() => {
    console.log(
      `Last time the operation was updated was on: ${poller.getOperationState().modifiedOn}`
    );
  });

  const results = await poller.pollUntilDone();
  let finalResult = "";
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
      finalResult += result.sentences.map((sentence) => sentence.text).join("\n");
    }
  }
  return finalResult;
}
*/

async function textSummary(text) {
  const {summary_text} = await inference.summarization({model: "sshleifer/distilbart-cnn-12-6", inputs: text});
  return summary_text;
}

const app = express();
app.use(express.json());

app.post('/text', async (req, res) => {
  const {text} = req.body;
  console.log(text);
  const summary = await textSummary(text);
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
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const filename = req.file.filename;
    let extractedText = "";

    if (filename.endsWith("pdf")) {
      const pdfBuffer = fs.readFileSync('uploads/' + filename);
      let {text} = await pdf(pdfBuffer);
      extractedText = text;
    } else if (filename.endsWith("docx")) {
      let {value} = await mammoth.extractRawText({path: 'uploads/' + filename});
      extractedText = value;
    } else if (filename.endsWith("txt")) {
      const textBuffer = fs.readFileSync('uploads/' + filename);
      extractedText = textBuffer.toString();
    } else {
      extractedText = "File not supported";
    }
    if (extractedText.length > 100000) {
      extractedText = extractedText.substring(0, 100000);
    }
    const summary = await textSummary(extractedText);
    res.json({summary});
  } catch(e) {
    console.error(e);
    res.json({summary: "Error processing file\n- Make sure the document has text data inside it."});
  }
});

app.get("/", (req, res) => {
  res.json({'hello': 'world'});
})

app.listen(port, () => {
  console.log("server started")
})