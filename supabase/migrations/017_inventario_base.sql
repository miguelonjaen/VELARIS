-- ==========================================================
-- VELARIS - INVENTARIO BASE DE EQUIPAMIENTO
-- ==========================================================
-- Seed idempotente:
--   - Se aplica a todos los barcos existentes.
--   - No duplica elementos existentes.
--   - No modifica inventario introducido manualmente.
-- ==========================================================

DO $$
DECLARE
    v_barco RECORD;
    v_item RECORD;
BEGIN

    FOR v_barco IN
        SELECT id
        FROM public.barcos
        WHERE id IS NOT NULL
    LOOP

        FOR v_item IN
            SELECT *
            FROM (
                VALUES
                    -- ======================================================
                    -- SEGURIDAD
                    -- ======================================================
                    ('Chaleco salvavidas adulto', 'SEG-CHAL-ADULTO', 6, 1, 'unidad', 'Cabina / acceso inmediato', 'Seguridad'),
                    ('Chaleco salvavidas infantil', 'SEG-CHAL-INFANTIL', 2, 0, 'unidad', 'Cabina', 'Seguridad'),
                    ('Aro salvavidas', 'SEG-ARO', 1, 1, 'unidad', 'Cubierta / popa', 'Seguridad'),
                    ('Bengalas de mano', 'SEG-BENG-MANO', 6, 0, 'unidad', 'Contenedor pirotecnia', 'Seguridad'),
                    ('Cohetes con paracaídas', 'SEG-COH-PAR', 4, 0, 'unidad', 'Contenedor pirotecnia', 'Seguridad'),
                    ('Señal fumígena', 'SEG-FUM', 2, 0, 'unidad', 'Contenedor pirotecnia', 'Seguridad'),
                    ('Espejo de señales', 'SEG-ESP', 1, 1, 'unidad', 'Equipo seguridad', 'Seguridad'),
                    ('Bocina de niebla', 'SEG-BOC', 1, 1, 'unidad', 'Equipo seguridad', 'Seguridad'),
                    ('Linterna estanca', 'SEG-LIN-EST', 2, 1, 'unidad', 'Cabina / emergencia', 'Seguridad'),
                    ('Silbato de emergencia', 'SEG-SIL', 4, 1, 'unidad', 'Chalecos', 'Seguridad'),

                    -- ======================================================
                    -- CONTRAINCENDIOS
                    -- ======================================================
                    ('Extintor portátil', 'INC-EXT', 2, 1, 'unidad', 'Acceso inmediato', 'Seguridad'),
                    ('Extintor adicional compartimento motor', 'INC-EXT-MOTOR', 1, 1, 'unidad', 'Compartimento motor', 'Seguridad'),
                    ('Manta ignífuga', 'INC-MANTA', 1, 1, 'unidad', 'Cocina', 'Seguridad'),

                    -- ======================================================
                    -- BOTIQUÍN
                    -- ======================================================
                    ('Botiquín náutico completo', 'MED-BOT-001', 1, 1, 'unidad', 'Cabina', 'Botiquín'),
                    ('Kit de primeros auxilios', 'MED-PA-001', 1, 1, 'unidad', 'Cabina', 'Botiquín'),

                    -- ======================================================
                    -- COMUNICACIONES / NAVEGACIÓN
                    -- ======================================================
                    ('Radio VHF fija', 'NAV-VHF-FIJA', 1, 1, 'unidad', 'Consola / mesa de navegación', 'Técnico'),
                    ('Radio VHF portátil', 'NAV-VHF-PORT', 1, 1, 'unidad', 'Equipo emergencia', 'Técnico'),
                    ('GPS / Plotter', 'NAV-GPS', 1, 1, 'unidad', 'Consola', 'Técnico'),
                    ('Compás magnético', 'NAV-COMPAS', 1, 1, 'unidad', 'Consola', 'Técnico'),
                    ('Cartas náuticas', 'NAV-CARTAS', 1, 1, 'juego', 'Mesa de navegación', 'General'),
                    ('Cartas náuticas digitales', 'NAV-CARTAS-DIG', 1, 1, 'licencia', 'Plotter / tablet', 'General'),
                    ('Linterna de navegación de emergencia', 'NAV-LIN-EMG', 1, 1, 'unidad', 'Equipo emergencia', 'Seguridad'),
                    ('Prismáticos', 'NAV-PRISM', 1, 1, 'unidad', 'Mesa de navegación', 'General'),

                    -- ======================================================
                    -- ELECTRICIDAD
                    -- ======================================================
                    ('Batería de servicio', 'ELE-BAT-SERV', 1, 1, 'unidad', 'Compartimento baterías', 'Técnico'),
                    ('Batería de arranque', 'ELE-BAT-ARR', 1, 1, 'unidad', 'Compartimento baterías', 'Técnico'),
                    ('Cargador de baterías', 'ELE-CARG', 1, 1, 'unidad', 'Compartimento eléctrico', 'Técnico'),
                    ('Luces de navegación', 'ELE-LUC-NAV', 1, 1, 'sistema', 'Mástil / cubierta', 'Técnico'),
                    ('Bombillas / lámparas de repuesto', 'ELE-LAMP-REP', 2, 1, 'unidad', 'Caja repuestos', 'Técnico'),

                    -- ======================================================
                    -- MOTOR
                    -- ======================================================
                    ('Correa de repuesto del motor', 'MOT-COR-REP', 1, 1, 'unidad', 'Caja repuestos', 'Técnico'),
                    ('Aceite motor de repuesto', 'MOT-ACEITE', 2, 1, 'litro', 'Compartimento motor', 'Técnico'),
                    ('Refrigerante motor', 'MOT-REFR', 1, 1, 'litro', 'Compartimento motor', 'Técnico'),
                    ('Filtro de combustible de repuesto', 'MOT-FILT-COMB', 1, 1, 'unidad', 'Caja repuestos', 'Técnico'),
                    ('Filtro de aceite de repuesto', 'MOT-FILT-ACE', 1, 1, 'unidad', 'Caja repuestos', 'Técnico'),

                    -- ======================================================
                    -- ACHIQUE / CASCO
                    -- ======================================================
                    ('Bomba de achique eléctrica', 'CAS-ACH-ELEC', 1, 1, 'unidad', 'Sentina', 'Técnico'),
                    ('Bomba de achique manual', 'CAS-ACH-MAN', 1, 1, 'unidad', 'Cabina / sentina', 'Seguridad'),
                    ('Tapones de emergencia', 'CAS-TAP', 1, 1, 'kit', 'Caja emergencia', 'Seguridad'),
                    ('Kit de reparación de emergencia', 'CAS-REP-EMG', 1, 1, 'kit', 'Caja emergencia', 'Técnico'),

                    -- ======================================================
                    -- FONDEO
                    -- ======================================================
                    ('Ancla principal', 'FON-ANCLA', 1, 1, 'unidad', 'Proa', 'General'),
                    ('Cadena de fondeo', 'FON-CADENA', 1, 1, 'tramo', 'Proa', 'General'),
                    ('Cabo de fondeo', 'FON-CABO', 1, 1, 'tramo', 'Proa', 'General'),
                    ('Molinete de ancla', 'FON-MOLINETE', 1, 1, 'unidad', 'Proa', 'Técnico'),
                    ('Ancla auxiliar', 'FON-ANCLA-AUX', 1, 0, 'unidad', 'Proa / pañol', 'General'),

                    -- ======================================================
                    -- AMARRE
                    -- ======================================================
                    ('Cabo de amarre', 'AMA-CABO', 6, 2, 'unidad', 'Pañol de proa', 'General'),
                    ('Defensa', 'AMA-DEF', 6, 4, 'unidad', 'Cubierta / pañol', 'General'),
                    ('Matafiones / cabos auxiliares', 'AMA-AUX', 4, 2, 'unidad', 'Pañol', 'General'),

                    -- ======================================================
                    -- HERRAMIENTAS
                    -- ======================================================
                    ('Caja de herramientas', 'HER-CAJA', 1, 1, 'unidad', 'Pañol', 'Técnico'),
                    ('Juego de llaves', 'HER-LLAVES', 1, 1, 'juego', 'Caja herramientas', 'Técnico'),
                    ('Destornilladores', 'HER-DEST', 1, 1, 'juego', 'Caja herramientas', 'Técnico'),
                    ('Alicates', 'HER-ALIC', 2, 1, 'unidad', 'Caja herramientas', 'Técnico'),
                    ('Cinta americana', 'HER-CINTA', 2, 1, 'rollo', 'Caja herramientas', 'General'),
                    ('Bridas', 'HER-BRIDAS', 20, 5, 'unidad', 'Caja herramientas', 'General'),
                    ('Cinta aislante', 'HER-AISL', 2, 1, 'rollo', 'Caja herramientas', 'Técnico'),

                    -- ======================================================
                    -- AGUA / VÍVERES
                    -- ======================================================
                    ('Agua potable de reserva', 'AGU-RES', 20, 5, 'litro', 'Depósito / reserva', 'Víveres'),
                    ('Agua embotellada de emergencia', 'AGU-EMG', 6, 2, 'litro', 'Cabina', 'Víveres'),

                    -- ======================================================
                    -- GENERAL / DOCUMENTACIÓN
                    -- ======================================================
                    ('Documentación del barco', 'DOC-BARCO', 1, 1, 'carpeta', 'Mesa de navegación', 'General'),
                    ('Manual del motor', 'DOC-MOTOR', 1, 1, 'unidad', 'Mesa de navegación', 'General'),
                    ('Manual de seguridad', 'DOC-SEG', 1, 1, 'unidad', 'Mesa de navegación', 'General'),
                    ('Cargadores USB / alimentación', 'GEN-CARG-USB', 2, 1, 'unidad', 'Cabina', 'General'),
                    ('Powerbank de emergencia', 'GEN-POWERBANK', 1, 1, 'unidad', 'Equipo emergencia', 'General')
            ) AS x(nombre, referencia, cantidad_actual, cantidad_minima, unidad, ubicacion, categoria)
        LOOP

            INSERT INTO public.inventario (
                barco_id,
                nombre,
                referencia,
                cantidad_actual,
                cantidad_minima,
                unidad,
                ubicacion,
                categoria
            )
            SELECT
                v_barco.id,
                v_item.nombre,
                v_item.referencia,
                v_item.cantidad_actual,
                v_item.cantidad_minima,
                v_item.unidad,
                v_item.ubicacion,
                v_item.categoria::inventory_category
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.inventario i
                WHERE i.barco_id = v_barco.id
                  AND (
                      i.referencia = v_item.referencia
                      OR lower(i.nombre) = lower(v_item.nombre)
                  )
            );

        END LOOP;

    END LOOP;

END $$;
