import '../ui/theme.css';
import { mount } from 'svelte';
import Popup from './Popup.svelte';
import { initStore } from '../ui/store.svelte';

initStore().then(() => mount(Popup, { target: document.body }));
