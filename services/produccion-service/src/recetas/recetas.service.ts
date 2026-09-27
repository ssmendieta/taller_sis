import { Injectable } from '@nestjs/common';

@Injectable()
export class RecetasService {

  private recetas = [
    {
      id: 1,
      producto_codigo: 'PROD-001',
      producto_nombre: 'Producto ejemplo',
      activa: true
    }
  ];

  findAll() {
    return this.recetas;
  }

  create(data: any) {
    const nueva = {
      id: this.recetas.length + 1,
      ...data
    };

    this.recetas.push(nueva);

    return nueva;
  }
}