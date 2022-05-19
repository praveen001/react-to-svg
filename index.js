import puppeteer from 'puppeteer';
import delay from 'delay';
import formatXML from 'xml-formatter';
import * as ReactDOMServer from 'react-dom/server';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';
import Comp from './Comp.js';

import { createDeferred } from 'dom-to-svg/lib/test/util.js';
import { forwardBrowserLogs } from 'dom-to-svg/lib/test/util.js';
import parcelBundler from 'parcel-bundler';

async function main() {
	const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)))

	// Start server to serve dom-to-svg files
	const bundler = new parcelBundler(path.resolve(root, './node_modules/dom-to-svg/lib/test/injected-script.js'), {
		hmr: false,
		sourceMaps: false, // Workaround for "Unterminated regular expression" Parcel bug
		minify: false,
		autoInstall: false,
		watch: false
	})
	const server = await bundler.serve(8080);

	// Render React component as markup
	const str = ReactDOMServer.renderToStaticMarkup(Comp())

	// Launch puppeteer browser
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	forwardBrowserLogs(page)

	// Load the react markup
	await page.setContent(str, {
		waitUntil: 'domcontentloaded'
	});

	// Run dom-to-svg
	const svgDeferred = createDeferred();
	await page.exposeFunction('resolveSVG', svgDeferred.resolve);
	await page.exposeFunction('rejectSVG', svgDeferred.reject);
	await page.addScriptTag({ url: 'http://localhost:8080/injected-script.js'})

	const generatedSVGMarkup = await Promise.race([
		svgDeferred.promise.catch(({ message, ...error }) => Promise.reject(Object.assign(new Error(message), error))),
		delay(6000).then(() => Promise.reject(new Error('Timeout generating SVG'))),
	]);
	const generatedSVGMarkupFormatted = formatXML(generatedSVGMarkup);

	// Write svg file
	await fs.writeFile("./out.svg", generatedSVGMarkupFormatted)

	// Clean up
	await browser.close()
	server.close();
}

main()