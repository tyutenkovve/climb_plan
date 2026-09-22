import {existsSync} from 'node:fs';
import {defineConfig} from '@playwright/test';
const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath=process.env.PLAYWRIGHT_CHROME_PATH||(existsSync(systemChrome)?systemChrome:undefined);
export default defineConfig({testDir:'./e2e',timeout:45000,use:{actionTimeout:5000,baseURL:'http://127.0.0.1:4173',browserName:'chromium',launchOptions:{executablePath,args:['--no-sandbox']}},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4173',url:'http://127.0.0.1:4173',reuseExistingServer:false,timeout:30000},reporter:'list'});
