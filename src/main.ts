import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/select.css';
import './styles/game.css';
import './styles/settings.css';
import './styles/results.css';
import { App } from './ui/app.ts';
import { initTheme } from './ui/theme.ts';

initTheme();

const root = document.getElementById('app')!;
const app = new App(root);
void app.boot();
