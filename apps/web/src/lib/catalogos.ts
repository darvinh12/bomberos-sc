/**
 * Carga de catálogos compartidos para los formularios de funcionarios.
 *
 * Se utiliza en las páginas de "Nuevo funcionario" y "Editar funcionario"
 * para evitar duplicar la carga paralela de los catálogos.
 *
 * Cada endpoint se envuelve en `.catch(() => [])` para que un fallo
 * individual no derribe el resto y el formulario siga renderizando
 * con los catálogos disponibles.
 */
import { api } from "@/lib/api";

export interface Catalogo {
  id: number;
  codigo: string;
  nombre: string;
  activo?: boolean;
}

export interface CatalogoEstacion extends Catalogo {
  zona_id: number;
}

export interface CatalogoMunicipio extends Catalogo {
  estado_id: number;
}

export interface CatalogoParroquia extends Catalogo {
  municipio_id: number;
}

export interface CatalogosFuncionario {
  jerarquias: Catalogo[];
  cargos: Catalogo[];
  condiciones: Catalogo[];
  zonas: Catalogo[];
  estaciones: CatalogoEstacion[];
  areas: Catalogo[];
  dependencias: Catalogo[];
  divisiones: Catalogo[];
  estadosCiviles: Catalogo[];
  gruposSanguineos: Catalogo[];
  nivelesEducativos: Catalogo[];
  especialidades: Catalogo[];
  // Nuevos
  tiposPersonal: Catalogo[];
  estatusFuncionario: Catalogo[];
  institucionesFormadoras: Catalogo[];
  estados: Catalogo[];
  municipios: CatalogoMunicipio[];
  parroquias: CatalogoParroquia[];
  tiposVivienda: Catalogo[];
  tenenciasVivienda: Catalogo[];
  // Mini-sprint
  parentescos: Catalogo[];
  tiposLicencia: Catalogo[];
  tiposNacionalizacion: Catalogo[];
  idiomas: Catalogo[];
  paises: Catalogo[];
  seccionesFuncionario: Catalogo[];
}

export async function cargarCatalogosFuncionario(
  token: string,
): Promise<CatalogosFuncionario> {
  const [
    jerarquias,
    cargos,
    condiciones,
    zonas,
    estaciones,
    areas,
    dependencias,
    divisiones,
    estadosCiviles,
    gruposSanguineos,
    nivelesEducativos,
    especialidades,
    tiposPersonal,
    estatusFuncionario,
    institucionesFormadoras,
    estados,
    municipios,
    parroquias,
    tiposVivienda,
    tenenciasVivienda,
    parentescos,
    tiposLicencia,
    tiposNacionalizacion,
    idiomas,
    paises,
    seccionesFuncionario,
  ] = await Promise.all([
    api.get<Catalogo[]>("/catalogos/jerarquias", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/cargos", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/condiciones", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/zonas", token).catch(() => [] as Catalogo[]),
    api
      .get<CatalogoEstacion[]>("/catalogos/estaciones", token)
      .catch(() => [] as CatalogoEstacion[]),
    api.get<Catalogo[]>("/catalogos/areas", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/dependencias", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/divisiones", token).catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/estados-civiles", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/grupos-sanguineos", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/niveles-educativos", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/especialidades", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/tipos-personal", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/estatus-funcionario", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/instituciones-formadoras", token)
      .catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/estados", token).catch(() => [] as Catalogo[]),
    api
      .get<CatalogoMunicipio[]>("/catalogos/municipios", token)
      .catch(() => [] as CatalogoMunicipio[]),
    api
      .get<CatalogoParroquia[]>("/catalogos/parroquias", token)
      .catch(() => [] as CatalogoParroquia[]),
    api
      .get<Catalogo[]>("/catalogos/tipos-vivienda", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/tenencias-vivienda", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/parentescos", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/tipos-licencia", token)
      .catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/tipos-nacionalizacion", token)
      .catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/idiomas", token).catch(() => [] as Catalogo[]),
    api.get<Catalogo[]>("/catalogos/paises", token).catch(() => [] as Catalogo[]),
    api
      .get<Catalogo[]>("/catalogos/secciones-funcionario", token)
      .catch(() => [] as Catalogo[]),
  ]);

  return {
    jerarquias,
    cargos,
    condiciones,
    zonas,
    estaciones,
    areas,
    dependencias,
    divisiones,
    estadosCiviles,
    gruposSanguineos,
    nivelesEducativos,
    especialidades,
    tiposPersonal,
    estatusFuncionario,
    institucionesFormadoras,
    estados,
    municipios,
    parroquias,
    tiposVivienda,
    tenenciasVivienda,
    parentescos,
    tiposLicencia,
    tiposNacionalizacion,
    idiomas,
    paises,
    seccionesFuncionario,
  };
}
