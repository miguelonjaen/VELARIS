alter table usuarios
add constraint fk_usuario_barco_activo
foreign key (barco_activo_id)
references barcos(id)
on delete set null;