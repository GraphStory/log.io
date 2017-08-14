const { createClient } = require("./src/client");
const is_https = window.location.href.indexOf("https") == 0;
const Client = createClient(window);
const client = new Client({ secure: is_https }, localStorage);