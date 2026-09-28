import test from 'node:test';
import assert from 'node:assert/strict';
import { cerrarSesion, guardarSesion, LIMITE_INACTIVIDAD_MS, obtenerSesion, registrarActividad } from '../src/services/sesion.js';

class Storage {
  #datos = new Map();
  getItem(clave) { return this.#datos.get(clave) ?? null; }
  setItem(clave, valor) { this.#datos.set(clave, String(valor)); }
  removeItem(clave) { this.#datos.delete(clave); }
}

function respuesta(expira) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expira / 1000) })).toString('base64url');
  return { accessToken: `cabecera.${payload}.firma`, usuario: { id: '3', rol: { nombre: 'Administrador' } } };
}

test.beforeEach(() => {
  globalThis.sessionStorage = new Storage();
  globalThis.localStorage = new Storage();
});

test('login conserva una sesión activa y logout borra token y usuario', () => {
  const ahora = 1_000_000;
  guardarSesion(respuesta(ahora + 3_600_000), ahora);
  assert.equal(obtenerSesion(ahora + 1000).id, '3');
  cerrarSesion();
  assert.equal(obtenerSesion(ahora + 2000), null);
  assert.equal(sessionStorage.getItem('accessToken'), null);
  assert.equal(sessionStorage.getItem('usuario'), null);
});

test('la inactividad expira aunque siga vigente el JWT; una acción previa al límite renueva el plazo', () => {
  const ahora = 1_000_000;
  guardarSesion(respuesta(ahora + 3_600_000), ahora);
  assert.equal(registrarActividad(ahora + LIMITE_INACTIVIDAD_MS - 1000), true);
  assert.ok(obtenerSesion(ahora + LIMITE_INACTIVIDAD_MS + 1000));
  assert.equal(obtenerSesion(ahora + 2 * LIMITE_INACTIVIDAD_MS - 1000), null);
});

test('un JWT vencido cierra la sesión aunque hubiera actividad reciente', () => {
  const ahora = 1_000_000;
  guardarSesion(respuesta(ahora + 60_000), ahora);
  assert.equal(obtenerSesion(ahora + 61_000), null);
});

test('no acepta tokens ilegibles ni una sesión recuperada sin usuario', () => {
  assert.throws(() => guardarSesion({ accessToken: 'invalido', usuario: { id: '3' } }, 1_000_000));
  sessionStorage.setItem('accessToken', respuesta(5_000_000).accessToken);
  sessionStorage.setItem('ultimaActividad', '1000000');
  assert.equal(obtenerSesion(1_000_000), null);
});
