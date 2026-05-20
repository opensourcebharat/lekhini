import { render } from 'solid-js/web';
import { ToolbarApp } from './App';

console.log('[pen-toolbar] booting');
const root = document.getElementById('root');
if (!root) throw new Error('No #root');
render(() => <ToolbarApp />, root);
console.log('[pen-toolbar] mounted');
