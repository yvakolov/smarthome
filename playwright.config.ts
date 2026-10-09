import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,timeout:45000,
  expect:{timeout:10000},retries:0,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4200',viewport:{width:1440,height:900},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:process.env['CHROMIUM_PATH']?{executablePath:process.env['CHROMIUM_PATH']}:{}},
  webServer:{command:'npx nx serve smart-home --host=127.0.0.1',url:'http://127.0.0.1:4200',reuseExistingServer:!process.env['CI'],timeout:180000,env:{NX_DAEMON:'false',NX_ISOLATE_PLUGINS:'false'}},
});
