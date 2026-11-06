import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { GuardarRutaDto } from './guardar-ruta.dto';

const MAX_BIGINT = BigInt('9223372036854775807');
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function objeto(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function idPositivo(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value) &&
    BigInt(value) >= BigInt('1') && BigInt(value) <= MAX_BIGINT;
}

function textoObligatorio(value: unknown, campo: string, maximo: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximo) {
    throw new BadRequestException(`${campo} es obligatorio y admite hasta ${maximo} caracteres`);
  }
  return value.trim();
}

@Injectable()
export class ValidarGuardarRutaPipe implements PipeTransform<unknown, GuardarRutaDto> {
  transform(value: unknown): GuardarRutaDto {
    const permitidos = ['grupoId', 'fechaProgramada', 'vehiculoExternoId', 'choferExternoId', 'paradas'];
    if (!objeto(value) || Object.keys(value).some((key) => !permitidos.includes(key))) {
      throw new BadRequestException('El cuerpo de la ruta no es válido');
    }

    const grupoRecibido = value.grupoId ?? null;
    if (grupoRecibido !== null && !idPositivo(grupoRecibido)) {
      throw new BadRequestException('grupoId debe ser un entero positivo enviado como texto');
    }
    const grupoId = grupoRecibido as string | null;

    const fecha = value.fechaProgramada;
    if (typeof fecha !== 'string' || !FECHA_ISO.test(fecha) ||
        Number.isNaN(Date.parse(`${fecha}T00:00:00Z`)) ||
        new Date(`${fecha}T00:00:00Z`).toISOString().slice(0, 10) !== fecha) {
      throw new BadRequestException('fechaProgramada debe ser una fecha válida YYYY-MM-DD');
    }

    const vehiculoExternoId = textoObligatorio(value.vehiculoExternoId, 'El vehículo', 80);
    const choferExternoId = textoObligatorio(value.choferExternoId, 'El chofer', 80);

    if (!Array.isArray(value.paradas) || value.paradas.length === 0) {
      throw new BadRequestException('La ruta debe incluir al menos una parada');
    }
    const boletasVistas = new Set<string>();
    const paradas = value.paradas.map((parada) => {
      if (!objeto(parada) || Object.keys(parada).some((key) => !['destino', 'boletaIds'].includes(key))) {
        throw new BadRequestException('Cada parada debe incluir solo destino y boletaIds');
      }
      const destino = textoObligatorio(parada.destino, 'El destino de la parada', 250);
      if (!Array.isArray(parada.boletaIds) || parada.boletaIds.length === 0) {
        throw new BadRequestException('Cada parada debe incluir al menos una boleta');
      }
      const boletaIds = parada.boletaIds.map((boletaId) => {
        if (!idPositivo(boletaId)) {
          throw new BadRequestException('Cada boleta debe ser un entero positivo enviado como texto');
        }
        if (boletasVistas.has(boletaId)) {
          throw new BadRequestException(`La boleta ${boletaId} está repetida en la ruta`);
        }
        boletasVistas.add(boletaId);
        return boletaId;
      });
      return { destino, boletaIds };
    });

    return { grupoId, fechaProgramada: fecha, vehiculoExternoId, choferExternoId, paradas };
  }
}
