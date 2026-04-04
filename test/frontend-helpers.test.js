const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("frontend escaping helpers sanitize HTML-sensitive content", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "public", "app.js"), "utf8");
  const context = {};
  const helpers = vm.runInNewContext(
    `${source}\n({ escapeHtml, renderErrorHtml, renderErrorTableRow })`,
    context
  );

  assert.equal(
    helpers.escapeHtml(`<img src=x onerror="alert('xss')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;"
  );

  assert.equal(
    helpers.renderErrorHtml(`<script>alert("boom")</script>`),
    "<p class=\"message visible error\">&lt;script&gt;alert(&quot;boom&quot;)&lt;/script&gt;</p>"
  );

  assert.equal(
    helpers.renderErrorTableRow(`<b>boom</b>`, 3),
    "<tr><td colspan=\"3\">&lt;b&gt;boom&lt;/b&gt;</td></tr>"
  );
});
