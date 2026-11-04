import '@fontsource/baloo-2/latin-600.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/nunito-sans/latin-400.css';
import '@fontsource/nunito-sans/latin-600.css';
import '@fontsource/nunito-sans/latin-700.css';
import './styles.css';
import { App } from './app';

const app = new App();
app.start();
// for troubleshooting from the browser console
(window as unknown as { FM: App }).FM = app;
