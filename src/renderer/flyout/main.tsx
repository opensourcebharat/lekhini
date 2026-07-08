import { render } from 'solid-js/web';
import { FlyoutWindowApp } from './App';

const root = document.getElementById('root');
if (root) render(() => <FlyoutWindowApp />, root);
