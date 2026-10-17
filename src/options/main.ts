import '../ui/theme.css';
import { mount } from 'svelte';
import Options from './Options.svelte';
import { initStore } from '../ui/store.svelte';

initStore('app.optionsTitle').then(() => mount(Options, { target: document.body }));
