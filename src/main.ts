import './style.css';
import { App } from './ui/app.ts';
import { initTheme } from './ui/theme.ts';

initTheme();

const root = document.getElementById('app')!;
const app = new App(root);
void app.boot();
