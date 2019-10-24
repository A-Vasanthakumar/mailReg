const puppeteer = require('puppeteer');
const axios = require('axios');
const LocalStorage = require('node-localstorage').LocalStorage;
const localStorage = new LocalStorage('./scratch');
const http = require('http');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs-extra');
var browser = '';
var failedStatus = "false";
let mainWindow;
const monthList = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var cmd = require('node-command-line'),
  Promise = require('bluebird');

// create Window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('closed', function () {
    mainWindow = null
  });
  ipcMain.on('Start_Yahoo', starting);
  ipcMain.on('Start_Google', starting);
}

// start function
async function starting(e, arg) {
  http.get(`http://127.0.0.1:${arg.port}/api/v1/profile/start?automation=true&puppeteer=true&profileId=${arg.id}`, (resp) => {
    let data = '';
    let ws = '';
    resp.on('data', (chunk) => {
      data += chunk;
    });
    resp.on('end', () => {
      let ws;
      try {
        ws = JSON.parse(data);
      } catch (err) {
        console.log(err);//cli.exe -login -u marvin.scales@outlook.com -p 1Tinkerme12#
      }
      if (typeof ws === 'object' && ws.hasOwnProperty('value')) {
        console.log(`Browser websocket endpoint: ${ws.value}`);
        if (ws.value.indexOf('already') > -1) {
          e.sender.send('notification', "Please Close the browser");
        } else {
          getData(e, ws.value, arg.sheetLink, arg.scriptLink, arg.sheet);
        }

      }
    });
  }).on("error", (err) => {
    console.log(err.message);
    e.sender.send('notification', JSON.stringify(err.message));
    cmd.run(`"C:\\Program Files (x86)\\Multilogin\\headless.exe" -port ${arg.port}`);
    console.log('Executed your command :)');
    //e.sender.send('retry', arg.sheet);
  });
}

async function getData(e, ws, sheetLink, Url, sheet) {

  browser = await puppeteer.connect({ browserWSEndpoint: ws });
  if (sheet == 'YAHOO') {
    try {
      e.sender.send('notification', "Gettting Data From Yahoo Sheet");
      var yahooResponse = await axios.get(Url + `?mail=yahoo&sheetLink=${sheetLink}`);
      var yahooResponseData = yahooResponse.data;

      if (yahooResponseData.length > 0) {
        await startyamil(e, sheetLink, Url, browser, yahooResponseData);
        e.sender.send('notification', "Done");
      } else {
        e.sender.send('notification', "Yahoo Sheet Empty Response");
      }
    } catch (err) {
      console.log(err)
      e.sender.send('error', JSON.stringify(err));
    }

  } else if (sheet == 'GOOGLE') {
    try {
      e.sender.send('notification', "Gettting Data From Google Sheet");
      var googleResponse = await axios.get(Url + `?mail=google&sheetLink=${sheetLink}`);
      var googleResponseData = googleResponse.data;

      if (googleResponseData.length > 0) {
        await startgamil(e, sheetLink, Url, browser, googleResponseData);
        e.sender.send('notification', "Done");
      } else {
        e.sender.send('notification', "Google Sheet Empty Response");
      }
    } catch (err) {
      console.log(err)
      e.sender.send('error', JSON.stringify(err));
    }
  }
  try {
    await browser.close();
  } catch (err) {
    console.log(err)
  }
}

// start Yahoo
async function startyamil(e, sheetLink, Url, browser, yahooResponseData) {
  const page = await browser.newPage();
  try {
    for (var s = 0; s < yahooResponseData.length; s++) {
      details = yahooResponseData[s];
      e.sender.send('process', details);
      var count = 0;
      do {
        await axios.post(Url, { statusYmail: [details.Id, 'Starting', sheetLink] });
        e.sender.send('notification', 'Starting');
        e.sender.send('notification', `${count + 1} try`);
        failedStatus = "false";
        await page.goto('https://login.yahoo.com/account/create?specId=yidReg', { timeout: 0 });
        await page.type('#usernamereg-firstName', details.firstName, { delay: 1 });
        await page.type('#usernamereg-lastName', details.lastName, { delay: 1 });
        await page.click('#usernamereg-yid');
        await page.waitForSelector('.desktop-suggestions-container .desktop-suggestion-list li');
        var emailAddress = await page.$eval('.desktop-suggestions-container .desktop-suggestion-list li', a => a.innerText);
        await page.click('.desktop-suggestions-container .desktop-suggestion-list li');
        await page.type('#usernamereg-password', details.password, { delay: 10 });

        /****    Get Phone Number    ****/
        var BearerToken = await getBearerToken();
        console.log("BearerToken- " + BearerToken);
        var targetId = await getAllTarget(BearerToken, "Yahoo");
        var createVerificationResponse;
        try {
          createVerificationResponse = await createverification(targetId, BearerToken);
        } catch (err) {
          throw err.response.statusText
        }
        var id = createVerificationResponse.id;
        console.log("id- " + id);
        var phoneNumber = createVerificationResponse.number;
        console.log("phoneNumber- " + phoneNumber);

        await page.select('.puree-dropdown select[name="shortCountryCode"]', 'US');
        await page.type('#usernamereg-phone', phoneNumber, { delay: 10 });
        var valueOfMonth = monthList.indexOf(details.month.toString().trim()) + 1;
        await page.click('#usernamereg-month');
        await page.waitFor(1000);
        await page.select('#usernamereg-month', valueOfMonth.toString());
        await page.type('#usernamereg-day', details.day.toString(), { delay: 10 });
        await page.type('#usernamereg-year', details.year.toString(), { delay: 10 });
        const button = await page.$('button#reg-submit-button');
        await button.click();
        await page.waitFor(5000);
        console.log('check error');
        var captcha = await page.$('#rc-anchor-container');
        if (captcha != null) {
          throw 'captcha error'
        }
        var erorCheck = await page.$('.writeup.bold');
        var Verification;
        if (erorCheck != null) {
          try {
            var report = await reportVerification(id, BearerToken);
            console.log("Reported..." + report);
            if (count == 3) {
              await axios.post(Url, { statusYmail: [details.Id, 'Waiting 30 s for to get  a Number', sheetLink] });
              e.sender.send('notification', 'Waiting 30 s for to get  a Number');
              await page.waitFor(30000);
              count = 0;
            }
            count = count + 1;
            failedStatus = "true";
          } catch (err) {
            console.log(err)
            await axios.post(Url, { statusYmail: [details.Id, 'Error', sheetLink] });
            e.sender.send('notification', JSON.stringify(err));
            continue
          }
        } else {
          await page.click('.pure-button.puree-button-primary.puree-spinner-button');
          await axios.post(Url, { statusYmail: [details.Id, 'Verification Pending', sheetLink] });
          e.sender.send('notification', 'Verification Pending');
          await page.waitFor(4000);
          Verification = await verification(id, BearerToken);
          if (Verification.status != 'Completed') {
            do {
              await page.waitFor(5000);
              Verification = await verification(id, BearerToken);
            } while (Verification.status != 'Completed');
          }
          await axios.post(Url, { statusYmail: [details.Id, 'verified', sheetLink] });
          e.sender.send('notification', 'verified');
          var message = Verification.sms;
          var textCode = message.slice(0, 5);
          await page.waitForSelector('#verify-code-button');
          await page.type('#verification-code-field', textCode, { delay: 10 });
          await page.click('#verify-code-button');
          await page.waitForSelector('.pure-button.puree-button-primary.puree-spinner-button');
          await page.click('.pure-button.puree-button-primary.puree-spinner-button');
          await page.waitFor(1000);
          await axios.post(Url, { ymail: [details.Id, emailAddress + '@yahoo.com', phoneNumber, sheetLink] });
          e.sender.send('notification', 'Store Google Sheet');
          try {
            await page.click('.subscription-checkbox.pure-u-1-8');
          } catch (e) {
            try {
              await page.click('.pure-button.puree-button-primary.puree-spinner-button');
            } catch (e) {
              console.log(e)
            }
          }
          await page.goto('https://login.yahoo.com/account/logout', { timeout: 0 });
          await page.waitForSelector('.signout');
          await page.click('.signout')
        }
      } while (failedStatus == "true");
    }
    await browser.close();
  } catch (err) {
    throw err
  }
}

async function startgamil(e, sheetLink, Url, browser, googleResponseData) {
  try {
    const page = await browser.newPage();
    await page.waitFor(10000);
    for (var s = 0; s < googleResponseData.length; s++) {
      details = googleResponseData[s];
      e.sender.send('process', details);
      await axios.post(Url, { statusGmail: [details.Id, 'Starting', sheetLink] });
      e.sender.send('notification', "Starting");
      await page.goto('https://accounts.google.com/signup', { timeout: 0 });
      await page.type('#firstName', details.firstName, { delay: 10 });
      await page.type('#lastName', details.lastName, { delay: 1 });
      await page.type('input[name="Username"]', details.firstName + details.lastName, { delay: 1 });
      await page.type('input[name="Passwd"]', details.password, { delay: 1 });
      await page.type('input[name="ConfirmPasswd"]', details.password, { delay: 1 });

      var suggestionList = null;
      do {
        await page.click('#accountDetailsNext');
        await page.waitFor(1000);
        suggestionList = await page.$("#usernameList");
      } while (suggestionList == null);
      var emailAddress = await page.$eval('#usernameList li', a => a.innerText);
      console.log(emailAddress)
      await page.click('#usernameList li button');
      await page.click('#accountDetailsNext');
      var count = 0;
      do {
        failedStatus = "false";
        /****    Get Phone Number    ****/
        var BearerToken = await getBearerToken();
        console.log("BearerToken- " + BearerToken);
        var targetId = await getAllTarget(BearerToken, "Gmail");
        var createVerificationResponse
        try {
          createVerificationResponse = await createverification(targetId, BearerToken);
        } catch (err) {
          throw err.response.statusText
        }
        var id = createVerificationResponse.id;
        console.log("id- " + id);
        var phoneNumber = createVerificationResponse.number;
        console.log("phoneNumber- " + phoneNumber);
        /****     Phone Number    ****/

        await page.waitForSelector('#countryList');
        const inputValue = await page.$eval('#phoneNumberId', el => el.value);
        for (let i = 0; i < inputValue.length; i++) {
          await page.keyboard.press('Backspace');
        }
        await page.waitFor(1000);
        await page.type('#phoneNumberId', '+1 ' + phoneNumber, { delay: 10 });
        await page.click('#gradsIdvPhoneNext');
        await page.waitFor(3000);

        console.log('check error');
        var verifytext = await page.$eval('.dEOOab.RxsGPe', a => a.innerText);
        if (verifytext != '') {
          try {
            var report = await reportVerification(id, BearerToken);
            console.log("Reported..." + report);
            if (count == 3) {
              await axios.post(Url, { statusGmail: [details.Id, 'Waiting 30 s for to get  a Number', sheetLink] });
              e.sender.send('notification', "Waiting 30 s for to get  a Number");
              await page.waitFor(30000);
              count = 0;
            }
            count = count + 1;
            failedStatus = "true";
          } catch (err) {
            console.log(err);
            await axios.post(Url, { statusGmail: [details.Id, 'Error', sheetLink] });
            e.sender.send('notification', JSON.stringify(err));
            continue
          }
        } else if (verifytext == '') {
          await axios.post(Url, { statusGmail: [details.Id, 'Verification Pending', sheetLink] });
          e.sender.send('notification', "Verification Pending");
          await page.waitFor(4000);
          Verification = await verification(id, BearerToken);
          if (Verification.status != 'Completed') {
            do {
              await page.waitFor(5000);
              Verification = await verification(id, BearerToken);
            } while (Verification.status != 'Completed');
          }
          var message = Verification.sms;
          var textCode = message.slice(2, 8);
          await page.type('#code', textCode);
          await page.click('#gradsIdvVerifyNext');
          await axios.post(Url, { statusGmail: [details.Id, 'verified', sheetLink] });
          e.sender.send('notification', "verified");
          var valueOfMonth = monthList.indexOf(details.month.toString().trim()) + 1;
          await page.waitForSelector('#month');
          await page.waitFor(2000);
          await page.type('input[aria-label="Recovery email address (optional)"]', details.recoveryEmail, { delay: 10 });
          await page.select('#month', valueOfMonth.toString());
          await page.type('#day', details.day.toString(), { delay: 10 });
          await page.type('#year', details.year.toString(), { delay: 10 });
          await page.select('#gender', '3');
          await page.waitFor(2000);
          await page.click('#personalDetailsNext');
          await page.waitFor(2000);
          try {
            await page.click('#phoneUsageNext');
            await page.waitFor(4000);
            try {
              const res = await page.$eval(`div[role="presentation"]`,
                e => {
                  e.scrollTop = e.scrollTop + 5000
                  return e
                });
            }
            catch (e) {
              console.log(e)
            }
            await page.evaluate(_ => {
                window.scrollBy(0, 5000);
            });
            await page.click('#termsofserviceNext');
            await page.waitFor(2000);
          } catch (err) {
            try {
              await page.click('#termsofserviceNext');
              await page.waitFor(2000);
            } catch (err) {
              throw err
            }
          }
          await page.screenshot({ path: `${emailAddress}.png` });
          await page.goto('https://accounts.google.com/Logout', { timeout: 0 })
          await axios.post(Url, { gmail: [details.Id, emailAddress + '@gmail.com', phoneNumber, sheetLink] });
          e.sender.send('notification', 'Store Google Sheet');
        }
      } while (failedStatus == "true");
    }
    await browser.close();
  } catch (err) {
    throw err
  }
}

// get Bearer token
async function getBearerToken() {
  var BearerToken
  var currentTime = new Date().getTime();
  var localTime = new Date(localStorage.getItem('expritime')).getTime();
  var diffTime = currentTime - localTime;
  if (localStorage.getItem('expritime') == null || 1800000 < diffTime) {
    var postData = { id: "33" };
    let axiosConfig = {
      headers: {
        "Authorization": "Basic RTQ1NlJQVEx5bEc4NUxpQlNEWG5QZXpvR1l1eVVhWTBJXzN2TEJyYUpNRWZhUlVuRnFWRzZvZVVsUHlONUVQMDpWeWU0cmV6ZFZSWk93RXZYVzZETV9LSnJjNW1JV0dqdkpoWkFfeTg4ZzZCYUpKU0x2RnU2SXF3aUJSZ2g0bVJF",
      }
    };
    var response = await axios.post('https://www.textverified.com/api/Authentication', postData, axiosConfig);
    console.log(response.data);
    BearerToken = response.data.bearer_token;
    localStorage.setItem('BearerToken', BearerToken);
    localStorage.setItem('expritime', new Date());
  } else {
    BearerToken = localStorage.getItem('BearerToken');
  }
  return BearerToken;
}

// create Verification
async function createverification(targetId, token) {
  let postData = {
    "id": targetId
  };
  let axiosConfig2 = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    }
  };
  var res = await axios.post('https://www.textverified.com/api/Verifications', postData, axiosConfig2);
  console.log(res.data);
  return res.data;
}

// verification
async function verification(id, token) {
  let axiosConfig2 = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    }
  };
  var res = await axios.get('https://www.textverified.com/api/Verifications/' + id, axiosConfig2);
  console.log(res.data);
  return res.data;
}

// Report Number
async function reportVerification(id, token) {
  let axiosConfig2 = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    }
  };
  try {
    var res = await axios.put('https://www.textverified.com/api/Verifications/' + id + '/Report', axiosConfig2);
    return res.data;
  } catch (e) {
    console.log(e)
  }
}

// get Target
async function getAllTarget(token, service) {
  let axiosConfig2 = {
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token,
    }
  };
  var res = await axios.get('https://www.textverified.com/api/Targets', axiosConfig2);
  var allTarget = res.data;
  var targetId;
  allTarget.forEach(function (row) {
    if (row.name == service) {
      targetId = row.targetId;
    }
  });
  return targetId
}

// start Window
app.on('ready', createWindow)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});
app.on('activate', function () {
  if (mainWindow === null) createWindow()
});