import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";

const baseUrl = (process.env.E2E_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const remoteUrl = process.env.SELENIUM_REMOTE_URL;
let driver;

before(async () => {
    try {
        const response = await fetch(baseUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
        throw new Error(
            `NEVE frontend is not reachable at ${baseUrl}. Start it with "npm run dev" or set E2E_BASE_URL. (${error.message})`
        );
    }

    const options = new chrome.Options();
    options.addArguments("--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--window-size=1440,1200");
    if (process.env.CHROME_BIN) options.setChromeBinaryPath(process.env.CHROME_BIN);

    const builder = new Builder().forBrowser("chrome").setChromeOptions(options);
    if (remoteUrl) builder.usingServer(remoteUrl);
    driver = await builder.build();
    await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30000, script: 10000 });
});

after(async () => {
    if (driver) await driver.quit();
});

async function open(path) {
    await driver.get(`${baseUrl}${path}`);
}

test("landing page presents NEVE's legal intelligence features", async () => {
    await open("/");
    const heading = await driver.wait(until.elementLocated(By.css("main h1")), 10000);
    assert.match(await heading.getText(), /Find your place\.\s*Know your rights\./);
    const features = driver.findElement(By.id("legal-ai"));
    await driver.executeScript("arguments[0].scrollIntoView()", features);
    await driver.wait(until.elementTextContains(features, "Risk Sentinel"), 10000);
    assert.ok(await features.isDisplayed());
    assert.match(await features.getText(), /ContractMind/);
});

test("home search opens discovery with the selected filters", async () => {
    await open("/");
    await driver.findElement(By.css('input[placeholder="Dhaka"]')).sendKeys("Dhaka");
    await driver.findElement(By.css('input[placeholder="Dhanmondi"]')).sendKeys("Dhanmondi");
    await driver.findElement(By.css("main button[type=submit]")).click();
    await driver.wait(until.urlContains("/properties?"), 10000);

    const current = new URL(await driver.getCurrentUrl());
    assert.equal(current.pathname, "/properties");
    assert.equal(current.searchParams.get("city"), "Dhaka");
    assert.equal(current.searchParams.get("area"), "Dhanmondi");
    assert.match(await driver.findElement(By.css("main")).getText(), /City: Dhaka/);
});

test("public navigation opens the property comparison page", async () => {
    await open("/");
    await driver.findElement(By.css('header a[href="/compare"]')).click();
    await driver.wait(until.urlContains("/compare"), 10000);
    assert.equal(await driver.findElement(By.css("main h1")).getText(), "Property comparison");
    assert.match(await driver.findElement(By.css("main")).getText(), /Nothing to compare yet/);
});

test("mobile navigation opens and routes to property discovery", async () => {
    await driver.manage().window().setRect({ width: 390, height: 844, x: 0, y: 0 });
    await open("/");
    const menu = driver.findElement(By.css('button[aria-label="Open menu"]'));
    await menu.click();
    await driver.wait(until.elementLocated(By.css('button[aria-expanded="true"]')), 5000);
    await driver.findElement(By.css('header nav a[href="/properties"]')).click();
    await driver.wait(until.urlContains("/properties"), 10000);
    assert.equal(new URL(await driver.getCurrentUrl()).pathname, "/properties");
    assert.match(await driver.findElement(By.css("main")).getText(), /All published homes/);
});

test("privacy policy route renders its page", async () => {
    await open("/privacy");
    await driver.wait(until.elementLocated(By.css("main h1")), 10000);
    assert.equal(await driver.findElement(By.css("main h1")).getText(), "Privacy policy");
});
