import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { Usuario } from '../../users/entities/usuario.entity';

export async function createAdminSeed(dataSource: DataSource) {

  const usuarioRepository = dataSource.getRepository(Usuario);

  const existeAdmin = await usuarioRepository.findOne({
    where: {
      correo: 'admin@sistema.com',
    },
  });


  if (existeAdmin) {
    console.log('Administrador inicial ya existe');
    return;
  }


  const passwordHash = await bcrypt.hash(
    'Admin123*',
    10,
  );


  const admin = usuarioRepository.create({
    nombreCompleto: 'Administrador Sistema',
    correo: 'admin@sistema.com',
    passwordHash,
    rolId: 1,
    activo: true,
  });


  await usuarioRepository.save(admin);

  console.log('Administrador inicial creado correctamente');
}