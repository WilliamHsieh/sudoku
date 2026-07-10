import './app.css'
import { mount } from 'svelte'
import App from './App.svelte'

// Svelte 5：class 實例化（new App）已移除，改用 mount()
const app = mount(App, {
  target: document.getElementById('app')
})

export default app
