const { parentPort } = require('worker_threads');
const mammoth = require('mammoth');

parentPort.on('message', async (data) => {
  try {
    const { buffer } = data;
    const result = await mammoth.convertToHtml({ buffer });

    // Process the document in the worker thread
    const wordCount = result.value.split(/\s+/).length;
    const pageCount = Math.max(1, Math.ceil(wordCount / 250));

    parentPort.postMessage({
      html: `<div class="doc-page resume-content">${result.value}</div>`,
      styles: result.messages?.map((msg) => msg.message) || [],
      images: {},
      metadata: {
        wordCount,
        pageCount,
        title: 'Resume Document',
        author: 'Resume Author',
        lastModified: new Date(),
      },
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
