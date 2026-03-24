import { createApp } from './src/app.js';
import { APP_CONFIG } from './src/config/settings.js';

const app = createApp();

app.listen(APP_CONFIG.port, APP_CONFIG.host, () => {
    console.log(`Pi Dashboard on http://${APP_CONFIG.host}:${APP_CONFIG.port}`);
});
