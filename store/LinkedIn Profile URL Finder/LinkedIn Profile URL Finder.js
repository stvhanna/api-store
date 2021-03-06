// Phantombuster configuration {
"phantombuster command: nodejs"
"phantombuster package: 5"
"phantombuster dependencies: lib-StoreUtilities.js, lib-WebSearch.js"

const { URL } = require("url")

const Buster = require("phantombuster")
const buster = new Buster()

const WebSearch = require("./lib-WebSearch")
const userAgent = WebSearch.getRandomUa()

const Nick = require("nickjs")
const nick = new Nick({
	loadImages: true,
	userAgent,
	printPageErrors: false,
	printResourceErrors: false,
	printNavigation: false,
	printAborts: false,
	debug: false,
	timeout: 15000,
	// randomize viewport
	width: (1180 + Math.round(Math.random() * 200)), // 1180 <=> 1380
	height: (700 + Math.round(Math.random() * 200)), // 700 <=> 900
})

const StoreUtilities = require("./lib-StoreUtilities")
const utils = new StoreUtilities(nick, buster)
const DEFAULT_DB_NAME = "result"
let db
// }

/**
 * @description Function used to remove all GET params and subdomains in a LinkedIn URL
 * @param {String} url - URL to normalize
 * @return {String} Normalized URL, if an error occured, returns the original URL
 */
const normalizeLinkedInURL = url => {
	try {
		let parsedUrl = new URL(url)
		parsedUrl.searchParams.forEach((value, name) => parsedUrl.searchParams.delete(name))
		if (parsedUrl.hostname !== "www.linkedin.com") {
			parsedUrl.hostname = "www.linkedin.com"
		}
		return parsedUrl.toString()
	} catch (err) {
		return url
	}
}

;(async () => {
	const tab = await nick.newTab()
	const webSearch = new WebSearch(tab, buster)
	let {spreadsheetUrl, queries, columnName, csvName} = utils.validateArguments()
	const toReturn = []

	if (!csvName) {
		csvName = DEFAULT_DB_NAME
	}

	if (spreadsheetUrl) {
		queries = await utils.getDataFromCsv(spreadsheetUrl, columnName)
	} else if (typeof(queries) === "string") {
		queries = [queries]
	}

	db = await utils.getDb(`${csvName}.csv`)

	queries = queries.filter(el => db.findIndex(line => line.query === el) < 0)
	if (queries.length < 1) {
		utils.log("Input is empty OR all queries are already scraped", "warning")
		nick.exit(0)
	}

	for (const one of queries) {
		const timeLeft = await utils.checkTimeLeft()
		if (!timeLeft.timeLeft) {
			utils.log(timeLeft.message, "warning")
			break
		}
		utils.log(`Searching for ${one} ...`, "loading")
		let search = await webSearch.search("linkedin.com " + one)
		let link = null
		for (const res of search.results) {
			if (res.link.indexOf("linkedin.com/in/") > 0) {
				link = normalizeLinkedInURL(res.link)
				break
			}
		}
		if (link) {
			utils.log(`Got ${link} for ${one} (${search.codename})`, "done")
		} else {
			link = "no url"
			utils.log(`No result for ${one} (${search.codename})`, "done")
		}
		toReturn.push({ linkedinUrl: link, query: one })
	}

	db.push(...toReturn)

	await tab.close()
	await utils.saveResults(toReturn, db, csvName, null, false)
	nick.exit()
})()
.catch(err => {
	utils.log(err, "error")
	nick.exit(1)
})
