import { render } from 'solid-js/web';
import { OverlayApp } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('No #root');
render(() => <OverlayApp />, root);
