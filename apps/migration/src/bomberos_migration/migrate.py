"""Orquestador de la migración PERSONALINTEGRADA → bomberos_caracas.

Orden de carga fijo (ver ``mapping.UNIDADES``):

1. estructura: zonas, divisiones, áreas, dependencias, estaciones, jerarquías,
   cargos, condiciones, niveles educativos, cursos, tipos de reposo.
2. salud_catalogos: grupos de diagnóstico, diagnósticos, médicos, centros.
3. funcionarios: FUNCIONARIOS ∪ FUNCIONARIOS_EGRESADOS + períodos de servicio
   (con DETALLE_EGRESO).
4. historicos: HISTORICO_JERARQUIA, HISTORICO_UBICACION_ADMINISTRATIVA.
5. identidad: CARGA_FAMILIAR, NIVEL_EDUCATIVO.
6. operaciones: REPOSOS, VACACIONES, RECURRENCIA (faltas), ENC/DET_GUARDIAS.
7. carrera: EVALUACIONES_CURSOS, ASCENSOS, EVALUACIONES.
8. egresos: JUBILADOS.

Los catálogos se RESUELVEN siempre (lectura); solo se CREAN entradas nuevas si
la unidad correspondiente está seleccionada con ``--only`` (o no hay --only).
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

from rich.console import Console

from .alcance import Alcance, calcular_alcance, resolver_zona, ubicaciones_vigentes
from .config import Config
from .destino import DestinoNulo, DestinoPg, FilaDestino
from .mapping import (
    CATALOGOS,
    MAPEOS,
    TABLAS_APOYO,
    TIPO_REPOSO_NO_ESPECIFICADO,
    motivo_exclusion,
    unidades_seleccionadas,
)
from .origen import Origen, OrigenSqlServer
from .reporte import EstadisticaTabla, ReporteMigracion
from .texto import a_json, compacto, norm_col, slug
from .transform import (
    Contexto,
    Expediente,
    Resultado,
    agrupar_expedientes,
    ascensos_from_legacy,
    carga_familiar_from_legacy,
    clave_origen,
    codigos_catalogo,
    curso_realizado_from_legacy,
    detectar_solapes,
    educacion_from_legacy,
    evaluacion_from_legacy,
    falta_from_legacy,
    flags_educacion,
    funcionario_from_legacy,
    guardia_from_legacy,
    guardia_funcionario_from_legacy,
    historico_jerarquias_from_legacy,
    historico_ubicaciones_from_legacy,
    indice_catalogo,
    jubilado_from_legacy,
    parse_bool,
    parse_cedula,
    parse_date,
    parse_int,
    planificar_catalogo,
    reconstruir_periodos_servicio,
    reposo_from_legacy,
    resolver_unicos,
    separar_extra,
    texto,
    vacacion_from_legacy,
)

console = Console()


@dataclass
class Opciones:
    aplicar: bool = False
    solo_origen: bool = False
    zona: str | None = None
    only: list[str] | None = None
    batch: int = 500
    carpeta_reporte: Path = field(default_factory=lambda: Path("."))
    hoy: date = field(default_factory=date.today)

    @property
    def modo(self) -> str:
        if self.solo_origen:
            return "solo-origen"
        return "apply" if self.aplicar else "ensayo"


class Motor:
    def __init__(self, origen: Origen, destino: Any, op: Opciones) -> None:
        self.o = origen
        self.d = destino
        self.op = op
        self.rep = ReporteMigracion(modo=op.modo, zona=op.zona)
        self.ctx = Contexto(hoy=op.hoy)
        self.unidades = set(unidades_seleccionadas(op.only))
        self._cache: dict[str, list[dict]] = {}
        self.expedientes: dict[int, Expediente] = {}
        self.alcance = Alcance(zona=None)
        self.periodos: dict[int, list[dict]] = {}
        self.avisos_periodos: dict[int, list[str]] = {}
        self.cat_destino: dict[str, list[dict]] = {}
        self.vigentes: dict[int, dict] = {}
        self._descartes_pendientes: list[tuple] = []
        self._descartes_expedientes: list[tuple[str, Any, str]] = []
        self._detalles: dict[int, list[dict]] | None = None

    # -- utilidades -----------------------------------------------------------
    def escribe(self, unidad: str) -> bool:
        return unidad in self.unidades

    def leer(self, tabla: str) -> list[dict]:
        if tabla not in self._cache:
            self._cache[tabla] = list(self.o.leer(tabla))
        return self._cache[tabla]

    def est(self, origen: str, destino: str | None = None) -> EstadisticaTabla:
        m = MAPEOS.get(origen)
        destino = destino or (m.destino if m else "?")
        return self.rep.tabla(origen, destino, m.columnas_extra() if m else [])

    def filtrar(self, tabla: str, col_cedula: str, est: EstadisticaTabla
                ) -> dict[int, list[dict]]:
        """Filas del origen agrupadas por cédula, solo las que entran en el alcance."""
        filas = self.leer(tabla)
        est.leidas = len(filas)
        grupos: dict[int, list[dict]] = defaultdict(list)
        huerfanas = 0
        for f in filas:
            ced = parse_cedula(f.get(col_cedula))
            if ced is not None and ced in self.alcance.cedulas:
                grupos[ced].append(f)
                est.en_alcance += 1
            elif ced is None or ced not in self.expedientes:
                if self.alcance.zona is None:
                    est.en_alcance += 1
                    clave = self._clave(tabla, f)
                    self._descartar(est, tabla, clave, "cédula sin expediente en FUNCIONARIOS ∪ "
                                    "FUNCIONARIOS_EGRESADOS (huérfana)")
                else:
                    huerfanas += 1
        if huerfanas:
            est.avisar(f"{huerfanas} filas huérfanas (cédula sin expediente) quedan fuera "
                       "de la zona")
        return grupos

    @staticmethod
    def _clave(tabla: str, f: dict) -> str:
        return clave_origen(tabla, f)

    def _fid(self, ced: int) -> int | None:
        return self.ctx.funcionarios.get(ced)

    def _anotar(self, est: EstadisticaTabla, r: Resultado) -> None:
        for a in r.avisos:
            est.avisar(a)
        est.columnas_no_previstas.update(r.no_previstas)

    async def _vaciar_descartes(self) -> None:
        if self._descartes_pendientes:
            await self.d.registrar_descartes(self._descartes_pendientes)
            self._descartes_pendientes = []

    async def _cargar(self, tabla_origen: str, tabla_destino: str,
                      filas: list[FilaDestino], est: EstadisticaTabla,
                      upsert_funcionario: bool = False) -> dict[str, int]:
        ids = await self.d.cargar(tabla_origen, tabla_destino, filas, est,
                                  upsert_funcionario=upsert_funcionario)
        await self._vaciar_descartes()
        return ids

    def _descartar(self, est: EstadisticaTabla, tabla: str, clave: str, motivo: str,
                   destino: str | None = None) -> None:
        est.descartar(clave, motivo)
        self._descartes_pendientes.append((0, tabla, clave, destino, motivo, None))

    # -- catálogos con código --------------------------------------------------
    async def _catalogo(self, unidad: str, entradas: list[tuple[str, str]],
                        extras: dict[str, dict] | None = None,
                        origen: str | None = None) -> dict[str, int]:
        """Resuelve un catálogo con columna ``codigo``: devuelve {clave_legacy: id}."""
        cfg = CATALOGOS[unidad]
        tabla_origen = origen or cfg.origen or f"{cfg.destino}:valores"
        est = self.est(tabla_origen, cfg.destino)
        if origen is None and cfg.origen:
            est.leidas = len(self.leer(cfg.origen))
            est.en_alcance += len(entradas)
        else:
            est.leidas += len(entradas)
            est.en_alcance += len(entradas)
        destino_filas = await self.d.catalogo(cfg.destino)
        trazas = await self.d.trazas(tabla_origen, cfg.destino)
        acciones = planificar_catalogo(cfg, entradas, destino_filas, trazas)
        crear = [a for a in acciones if a.tipo == "crear"]
        if crear and self.escribe(unidad):
            nuevos, vistos = [], set()
            for a in crear:
                if a.codigo_nuevo in vistos:
                    continue
                vistos.add(a.codigo_nuevo)
                nuevos.append({"codigo": a.codigo_nuevo, "nombre": a.nombre or a.codigo_nuevo,
                               **(extras or {}).get(a.clave, {})})
            await self.d.crear_catalogo(cfg.destino, nuevos)
            destino_filas = await self.d.catalogo(cfg.destino)
            self.rep.catalogos_creados[cfg.destino] = [n["codigo"] for n in nuevos]
        por_codigo = codigos_catalogo(destino_filas)
        resultado: dict[str, int] = {}
        filas_traza: list[FilaDestino] = []
        for a in acciones:
            fid = a.id_destino
            if a.tipo == "crear":
                fid = por_codigo.get(str(a.codigo_nuevo).upper())
            if fid is None:
                motivo = ("no casa con el catálogo destino y la unidad no está seleccionada"
                          if a.tipo == "crear" else "valor no reconocido (catálogo cerrado)")
                self._descartar(est, tabla_origen, a.clave, motivo, cfg.destino)
                continue
            resultado[a.clave] = fid
            if a.tipo == "crear":
                est.insertadas += 1
            elif a.tipo == "semilla":
                est.vinculadas += 1
            else:
                est.sin_cambios += 1
            filas_traza.append(FilaDestino(a.clave, id_existente=fid))
        await self.d.cargar(tabla_origen, cfg.destino, filas_traza,
                            EstadisticaTabla(tabla_origen, cfg.destino))
        await self._vaciar_descartes()
        self.cat_destino[cfg.destino] = destino_filas
        return resultado

    @staticmethod
    def _int_keys(m: dict[str, int]) -> dict[int, int]:
        out = {}
        for k, v in m.items():
            n = parse_int(k)
            if n is not None:
                out[n] = v
        return out

    def _entradas(self, tabla: str, col_cod: str, col_nombre: str) -> list[tuple[str, str]]:
        out = []
        est = self.est(tabla)
        for f in self.leer(tabla):
            cod = parse_int(f.get(col_cod))
            if cod is None:
                est.en_alcance += 1
                self._descartar(est, tabla, clave_origen(tabla, f), f"{col_cod} vacío")
                continue
            _, nop = separar_extra(f, tabla)
            est.columnas_no_previstas.update(nop)
            out.append((str(cod), texto(f.get(col_nombre)) or ""))
        return out

    # -- fase 1: estructura ----------------------------------------------------
    async def estructura(self) -> None:
        self.ctx.zonas = self._int_keys(await self._catalogo(
            "zonas", self._entradas("ZONAS", "COD_ZONA", "ZONA")))
        self.ctx.divisiones = self._int_keys(await self._catalogo(
            "divisiones", self._entradas("DIVISIONES", "COD_DIVISION", "DIVISION")))
        self.ctx.areas = self._int_keys(await self._catalogo(
            "areas", self._entradas("AREAS", "COD_AREA", "AREA")))
        self.ctx.dependencias = self._int_keys(await self._catalogo(
            "dependencias", self._entradas("DEPENDENCIAS", "COD_DEPENDENCIA", "DEPENDENCIA")))
        await self.estaciones()
        self.ctx.jerarquias = self._int_keys(await self._catalogo(
            "jerarquias", self._entradas("JERARQUIAS", "COD_JERARQUIA", "JERARQUIA")))
        self.ctx.jerarquias_por_nombre = indice_catalogo(
            self.cat_destino.get("core.jerarquias", []), CATALOGOS["jerarquias"])
        self.ctx.cargos = self._int_keys(await self._catalogo(
            "cargos", self._entradas("CARGOS", "COD_CARGO", "CARGO")))
        await self.condiciones()
        self.ctx.niveles = self._int_keys(await self._catalogo(
            "niveles_educativos", self._entradas("TIPO_NIVEL_EDUCATIVO", "COD_NIVEL",
                                                 "TIPO_NIVEL")))
        self.ctx.niveles_por_nombre = indice_catalogo(
            self.cat_destino.get("core.niveles_educativos", []), CATALOGOS["niveles_educativos"])
        extras_cursos = {}
        for f in self.leer("CURSOS"):
            cod = parse_int(f.get("COD_CURSO"))
            if cod is None:
                continue
            extras_cursos[str(cod)] = {
                "es_ascenso": bool(parse_bool(f.get("ASCENSO"))),
                "nivel_jerarquia_destino_id": self.ctx.jerarquias.get(
                    parse_int(f.get("COD_JERARQUIA")) or -1),
            }
        self.ctx.cursos = self._int_keys(await self._catalogo(
            "cursos", self._entradas("CURSOS", "COD_CURSO", "DESCRIPCION"), extras_cursos))
        await self.tipos_reposo()
        await self.catalogos_cerrados()

    async def estaciones(self) -> None:
        est = self.est("ESTACIONES")
        filas = self.leer("ESTACIONES")
        est.leidas = est.en_alcance = len(filas)
        idx = indice_catalogo(await self.d.catalogo("org.estaciones"))
        trazas = await self.d.trazas("ESTACIONES", "org.estaciones")
        salida: list[FilaDestino] = []
        for f in filas:
            cod = parse_int(f.get("COD_ESTACION"))
            if cod is None:
                self._descartar(est, "ESTACIONES", "None", "COD_ESTACION vacío")
                continue
            cz = parse_int(f.get("COD_ZONA"))
            if cz is not None:
                self.ctx.estacion_zona[cod] = cz
            clave = str(cod)
            nombre = texto(f.get("NOMBRE_LARGO")) or texto(f.get("NOMBRE_CORTO")) or f"EST_{cod}"
            extra, nop = separar_extra(f, "ESTACIONES")
            est.columnas_no_previstas.update(nop)
            if clave in trazas and not self.escribe("estaciones"):
                salida.append(FilaDestino(clave, id_existente=trazas[clave], extra=extra))
                continue
            if clave not in trazas:
                ya = idx.get(compacto(nombre)) or idx.get(compacto(f"EST_{cod}"))
                if ya is not None:
                    salida.append(FilaDestino(clave, id_existente=ya, extra=extra))
                    continue
            if not self.escribe("estaciones"):
                self._descartar(est, "ESTACIONES", clave, "estación nueva y la unidad "
                                "'estaciones' no está seleccionada", "org.estaciones")
                continue
            zona_id = self.ctx.zonas.get(cz) if cz is not None else None
            if zona_id is None:
                self._descartar(est, "ESTACIONES", clave,
                                "zona no resuelta (zona_id es obligatoria)", "org.estaciones")
                continue
            salida.append(FilaDestino(clave, {
                "zona_id": zona_id,
                "codigo": f"EST_{cod}",
                "nombre": nombre,
                "nombre_corto": texto(f.get("NOMBRE_CORTO")),
                "direccion": texto(f.get("DIRECCION")),
                "telefono": texto(f.get("TELEFONOS")),
            }, extra=extra))
        ids = await self._cargar("ESTACIONES", "org.estaciones", salida, est)
        self.ctx.estaciones = self._int_keys(ids)

    async def condiciones(self) -> None:
        entradas = self._entradas("CONDICIONES", "COD_CONDICION", "DESCRIPCION")
        mapa = await self._catalogo("condiciones", entradas)
        self.ctx.condiciones = self._int_keys(mapa)
        idx = indice_catalogo(self.cat_destino.get("core.condiciones", []))
        # Textos libres de FUNCIONARIOS.CONDICION que no casan con el catálogo
        textos: dict[str, str] = {}
        for t in ("FUNCIONARIOS", "FUNCIONARIOS_EGRESADOS"):
            for f in self.leer(t):
                v = texto(f.get("CONDICION"))
                if v and compacto(v) not in idx and parse_int(v) is None:
                    textos.setdefault(slug(v), v)
        if textos:
            extra = await self._catalogo("condiciones", list(textos.items()),
                                         origen="FUNCIONARIOS.CONDICION")
            del extra
        self.ctx.condiciones_por_nombre = indice_catalogo(
            await self.d.catalogo("core.condiciones"))
        for f in self.leer("CONDICIONES"):
            cod = parse_int(f.get("COD_CONDICION"))
            if cod in self.ctx.condiciones and texto(f.get("DESCRIPCION")):
                self.ctx.condiciones_por_nombre.setdefault(
                    compacto(f.get("DESCRIPCION")), self.ctx.condiciones[cod])

    async def tipos_reposo(self) -> None:
        valores: dict[str, str] = {}
        vacio = False
        for f in self.leer("REPOSOS"):
            v = texto(f.get("TIPOREPOSO"))
            if v:
                valores.setdefault(slug(v), v)
            else:
                vacio = True
        await self._catalogo("tipos_reposo", list(valores.items()), origen="REPOSOS.TIPOREPOSO")
        if vacio and self.escribe("tipos_reposo"):
            cod, nom = TIPO_REPOSO_NO_ESPECIFICADO
            await self.d.crear_catalogo("core.tipos_reposo", [{
                "codigo": cod, "nombre": nom, "requiere_diagnostico": False}])
        filas = await self.d.catalogo("core.tipos_reposo")
        self.ctx.tipos_reposo = indice_catalogo(filas, CATALOGOS["tipos_reposo"])
        for v in valores.values():
            fid = self.ctx.tipos_reposo.get(compacto(v))
            if fid is None:
                fid = codigos_catalogo(filas).get(f"LEG_{slug(v)}")
            if fid is not None:
                self.ctx.tipos_reposo[compacto(v)] = fid
        self.ctx.tipo_reposo_no_especificado = codigos_catalogo(filas).get(
            TIPO_REPOSO_NO_ESPECIFICADO[0])

    async def catalogos_cerrados(self) -> None:
        ec = await self.d.catalogo("core.estados_civiles")
        self.ctx.estados_civiles = indice_catalogo(ec, CATALOGOS["estados_civiles"])
        gs = await self.d.catalogo("core.grupos_sanguineos")
        self.ctx.grupos_sanguineos = codigos_catalogo(gs)
        sec = await self.d.catalogo("core.secciones_funcionario")
        self.ctx.secciones = codigos_catalogo(sec)
        lic = await self.d.catalogo("core.tipos_licencia")
        self.ctx.tipos_licencia = indice_catalogo(lic)
        par = await self.d.catalogo("core.parentescos")
        idx: dict[str, str] = {}
        for p in par:
            idx[compacto(p["codigo"])] = p["codigo"]
            idx[compacto(p["nombre"])] = p["codigo"]
        codigos = {p["codigo"] for p in par}
        for alias, cod in CATALOGOS["parentescos"].sinonimos.items():
            if cod in codigos:
                idx[compacto(alias)] = cod
        self.ctx.parentescos = idx

    # -- fase 2: salud ---------------------------------------------------------
    async def salud_catalogos(self) -> None:
        self.ctx.grupos_diagnosticos = self._int_keys(await self._catalogo(
            "grupos_diagnosticos", self._entradas("GRUPOSDIAGNOSTICOS", "CODGRUPODIAGNOSTICO",
                                                  "GRUPODIAGNOSTICO")))
        await self._entidad_por_nombre(
            "DIAGNOSTICOS", "salud.diagnosticos", "diagnosticos", "CODDIAGNOSTICO",
            lambda f: texto(f.get("DIAGNOSTICO")),
            lambda f, nombre: {
                "nombre": nombre,
                "grupo_id": self.ctx.grupos_diagnosticos.get(
                    parse_int(f.get("CODGRUPODIAGNOSTICO")) or -1),
            }, self.ctx.diagnosticos)
        for f in self.leer("DIAGNOSTICOS"):
            cod = parse_int(f.get("CODDIAGNOSTICO"))
            if cod is not None and texto(f.get("DIAGNOSTICO")):
                self.ctx.diagnosticos_nombre[cod] = texto(f.get("DIAGNOSTICO")) or ""
        for f in self.leer("ESPECIALIDADES"):
            cod = parse_int(f.get("ID_ESPE"))
            if cod is not None and texto(f.get("ESPECIALIDAD")):
                self.ctx.especialidades[cod] = texto(f.get("ESPECIALIDAD")) or ""

        def nombre_medico(f: dict) -> str | None:
            ap, no = texto(f.get("APELLIDOS")), texto(f.get("NOMBRES"))
            return f"{ap or ''}, {no or ''}" if (ap or no) else None

        mpps_vistos: set[str] = set()

        def valores_medico(f: dict, _nombre: str) -> dict:
            mpps = texto(f.get("MSAS"))
            if mpps and mpps.upper() in mpps_vistos:
                mpps = None  # UNIQUE en destino: el duplicado queda en legacy_extra
            elif mpps:
                mpps_vistos.add(mpps.upper())
            return {
                "cedula": parse_cedula(f.get("CEDULA_MEDICO")),
                "apellidos": texto(f.get("APELLIDOS")) or "",
                "nombres": texto(f.get("NOMBRES")) or "",
                "mpps": mpps,
                "especialidad": self.ctx.especialidades.get(
                    parse_int(str(f.get("ID_ESPE") or "").strip()) or -1),
            }

        await self._entidad_por_nombre("MEDICO_TRATANTE", "salud.medicos", "medicos",
                                       "ID_MEDICO", nombre_medico, valores_medico,
                                       self.ctx.medicos, campo_nombre="nombre_completo")
        await self._entidad_por_nombre(
            "CENTROS_MEDICOS", "salud.centros_medicos", "centros_medicos", "COD_INSTITUCION",
            lambda f: texto(f.get("INSTITUCION")),
            lambda f, nombre: {"nombre": nombre, "tipo": texto(f.get("TIPO_CENTRO"))},
            self.ctx.centros)
        for f in self.leer("CENTROS_MEDICOS"):
            cod = parse_int(f.get("COD_INSTITUCION"))
            if cod in self.ctx.centros and texto(f.get("INSTITUCION")):
                self.ctx.centros_por_nombre[compacto(f.get("INSTITUCION"))] = self.ctx.centros[cod]

    async def _entidad_por_nombre(self, tabla: str, destino: str, unidad: str, col_cod: str,
                                  nombre_de: Any, valores_de: Any, mapa: dict[int, int],
                                  campo_nombre: str = "nombre") -> None:
        """Catálogos sin columna ``codigo`` (diagnósticos, médicos, centros).

        Resolución: traza previa → mismo nombre ya presente en el destino →
        alta nueva. Filas del origen con el mismo nombre comparten la entrada.
        """
        est = self.est(tabla)
        filas = self.leer(tabla)
        est.leidas = est.en_alcance = len(filas)
        existentes = await self.d.catalogo(destino)
        idx = {compacto(e.get(campo_nombre)): e["id"] for e in existentes if e.get(campo_nombre)}
        trazas = await self.d.trazas(tabla, destino)
        salida: list[FilaDestino] = []
        primero: dict[str, FilaDestino] = {}
        for f in filas:
            cod = parse_int(f.get(col_cod))
            if cod is None:
                self._descartar(est, tabla, "None", f"{col_cod} vacío", destino)
                continue
            clave = str(cod)
            nombre = nombre_de(f)
            extra, nop = separar_extra(f, tabla)
            est.columnas_no_previstas.update(nop)
            if not nombre:
                self._descartar(est, tabla, clave, "sin nombre (es obligatorio)", destino)
                continue
            if compacto(nombre) in primero:
                # Mismo nombre que otra fila del origen → misma entrada destino (evita que
                # dos filas «Lumbago»/«LUMBAGO» se pisen el nombre en cada corrida).
                primero[compacto(nombre)].trazas_extra.append((tabla, clave))
                est.vinculadas += 1
                continue
            if clave in trazas and not self.escribe(unidad):
                fila = FilaDestino(clave, id_existente=trazas[clave], extra=extra)
                primero[compacto(nombre)] = fila
                salida.append(fila)
                continue
            if clave not in trazas:
                ya = idx.get(compacto(nombre))
                if ya is not None:
                    fila = FilaDestino(clave, id_existente=ya, extra=extra)
                    primero[compacto(nombre)] = fila
                    salida.append(fila)
                    continue
            if not self.escribe(unidad):
                self._descartar(est, tabla, clave, f"entrada nueva y la unidad '{unidad}' no "
                                "está seleccionada", destino)
                continue
            fila = FilaDestino(clave, valores_de(f, nombre), extra=extra)
            primero.setdefault(compacto(nombre), fila)
            salida.append(fila)
        ids = await self._cargar(tabla, destino, salida, est)
        for fila in salida:
            for _, cl in fila.trazas_extra:
                if fila.clave in ids:
                    ids[cl] = ids[fila.clave]
        mapa.update(self._int_keys(ids))

    # -- expedientes y alcance -------------------------------------------------
    async def preparar_alcance(self) -> None:
        func = self.leer("FUNCIONARIOS")
        egr = self.leer("FUNCIONARIOS_EGRESADOS")
        self.expedientes, descartes = agrupar_expedientes(func, egr)
        self._descartes_expedientes = descartes
        vig = ubicaciones_vigentes(self.leer("UBICACION_ADMINISTRATIVA"),
                                   self.leer("HISTORICO_UBICACION_ADMINISTRATIVA"))
        self.vigentes = vig
        cod_zona = None
        if self.op.zona:
            codigos = {f["id"]: f.get("codigo") for f in self.cat_destino.get("org.zonas", [])}
            destino_por_cod = {c: codigos.get(i) for c, i in self.ctx.zonas.items()
                               if codigos.get(i)}
            cod_zona = resolver_zona(self.op.zona, self.leer("ZONAS"), destino_por_cod)
            nombre = next((texto(z.get("ZONA")) for z in self.leer("ZONAS")
                           if parse_int(z.get("COD_ZONA")) == cod_zona), "")
            self.rep.zona = (f"{self.op.zona} (COD_ZONA={cod_zona} «{nombre}»"
                             + (f" → {destino_por_cod[cod_zona]}" if cod_zona in destino_por_cod
                                else "") + ")")
        self.alcance = calcular_alcance(set(self.expedientes), vig, self.ctx.estacion_zona,
                                        cod_zona)
        self.rep.alcance = self.alcance.como_dict()

    # -- fase 3: funcionarios y períodos ---------------------------------------
    async def funcionarios(self) -> None:
        est = self.est("EXPEDIENTE", "personal.funcionarios")
        est.columnas_extra = sorted(set(MAPEOS["FUNCIONARIOS"].columnas_extra())
                                    | set(MAPEOS["FUNCIONARIOS_EGRESADOS"].columnas_extra()))
        est.leidas = len(self.expedientes)
        e_tab = {"FUNCIONARIOS": self.est("FUNCIONARIOS"),
                 "FUNCIONARIOS_EGRESADOS": self.est("FUNCIONARIOS_EGRESADOS"),
                 "UBICACION_ADMINISTRATIVA": self.est("UBICACION_ADMINISTRATIVA",
                                                      "personal.funcionarios (metadata)")}
        for t, e in e_tab.items():
            e.leidas = len(self.leer(t))
        for tabla, clave, motivo in self._descartes_expedientes:
            if self.alcance.zona is None:
                e_tab[tabla].en_alcance += 1
                self._descartar(e_tab[tabla], tabla, str(clave), motivo, "personal.funcionarios")
        ubi_por_ced: dict[int, list[dict]] = defaultdict(list)
        for f in self.leer("UBICACION_ADMINISTRATIVA"):
            c = parse_cedula(f.get("CEDULA"))
            if c is not None and c in self.alcance.cedulas:
                ubi_por_ced[c].append(f)
                e_tab["UBICACION_ADMINISTRATIVA"].en_alcance += 1
        educacion = self.agrupar("NIVEL_EDUCATIVO", "CEDULA")

        filas: list[FilaDestino] = []
        for ced in sorted(self.alcance.cedulas):
            exp = self.expedientes[ced]
            est.en_alcance += 1
            if exp.activo is not None:
                e_tab["FUNCIONARIOS"].en_alcance += 1
            e_tab["FUNCIONARIOS_EGRESADOS"].en_alcance += len(exp.egresos)
            ub = self.vigentes.get(ced)
            pers, avisos = reconstruir_periodos_servicio(exp.filas, self._detalles_de(ced))
            self.periodos[ced] = pers
            self.avisos_periodos[ced] = avisos
            r = funcionario_from_legacy(exp, self.ctx, ub,
                                        flags_educacion(educacion.get(ced, [])))
            self._anotar(est, r)
            if not r.ok:
                self._descartar(est, "EXPEDIENTE", str(ced), r.motivo or "?",
                                "personal.funcionarios")
                for t, n in (("FUNCIONARIOS", 1 if exp.activo else 0),
                             ("FUNCIONARIOS_EGRESADOS", len(exp.egresos)),
                             ("UBICACION_ADMINISTRATIVA", len(ubi_por_ced.get(ced, [])))):
                    for _ in range(n):
                        e_tab[t].descartar(ced, "expediente descartado: " + (r.motivo or "?"))
                continue
            assert r.valores is not None
            if pers:
                r.valores["fecha_primer_ingreso"] = pers[0]["fecha_ingreso"]
            extras: list[tuple[str, str]] = []
            if exp.activo is not None:
                extras.append(("FUNCIONARIOS", str(ced)))
            if exp.egresos:
                extras.append(("FUNCIONARIOS_EGRESADOS", str(ced)))
            for u in ubi_por_ced.get(ced, []):
                extras.append(("UBICACION_ADMINISTRATIVA", str(a_json(u.get("ID")))))
            filas.append(FilaDestino(str(ced), r.valores, trazas_extra=extras))

        if not self.escribe("funcionarios"):
            await self._cargar_ids_funcionarios()
            return
        ocupados = await self._ocupados()
        for a in resolver_unicos([f.valores for f in filas if f.valores], ocupados):
            est.avisar(a)
        ids = await self._cargar("EXPEDIENTE", "personal.funcionarios", filas, est,
                                 upsert_funcionario=True)
        self.ctx.funcionarios = {int(k): v for k, v in ids.items()}
        for f in filas:
            for tabla, _ in f.trazas_extra:
                n = len(self.expedientes[int(f.clave)].egresos) if (
                    tabla == "FUNCIONARIOS_EGRESADOS") else 1
                if f.clave in ids:
                    e_tab[tabla].vinculadas += n
                else:
                    for _ in range(n):
                        e_tab[tabla].descartar(f.clave, "el motor rechazó el expediente")

    def agrupar(self, tabla: str, col_cedula: str) -> dict[int, list[dict]]:
        """Filas del alcance agrupadas por cédula, sin contar estadísticas."""
        grupos: dict[int, list[dict]] = defaultdict(list)
        for f in self.leer(tabla):
            ced = parse_cedula(f.get(col_cedula))
            if ced is not None and ced in self.alcance.cedulas:
                grupos[ced].append(f)
        return grupos

    def _detalles_de(self, ced: int) -> list[dict]:
        if self._detalles is None:
            grupos: dict[int, list[dict]] = defaultdict(list)
            for f in self.leer("DETALLE_EGRESO"):
                c = parse_cedula(f.get("CEDULA"))
                if c is not None:
                    grupos[c].append(f)
            self._detalles = grupos
        return self._detalles.get(ced, [])

    async def _ocupados(self) -> dict[str, dict[str, tuple[str, int]]]:
        ocup: dict[str, dict[str, tuple[str, int]]] = {"numero_empleado": {}, "correo": {}}
        for col in ("numero_empleado", "correo"):
            for r in await self.d.filas(
                    f"SELECT lower({col}::text) AS v, nacionalidad, cedula "  # noqa: S608
                    f"FROM personal.funcionarios WHERE {col} IS NOT NULL"):
                ocup[col][r["v"]] = (r["nacionalidad"], int(r["cedula"]))
        return ocup

    async def _cargar_ids_funcionarios(self) -> None:
        if self.d.simulado:
            return
        rows = await self.d.filas(
            "SELECT id, cedula FROM personal.funcionarios WHERE cedula = ANY($1::int[])",
            sorted(self.alcance.cedulas))
        self.ctx.funcionarios = {int(r["cedula"]): int(r["id"]) for r in rows}

    async def periodos_servicio(self) -> None:
        est = self.est("PERIODOS (reconstruidos)", "personal.periodos_servicio")
        det = self.est("DETALLE_EGRESO")
        self.filtrar("DETALLE_EGRESO", "CEDULA", det)
        filas: list[FilaDestino] = []
        for ced in sorted(self.alcance.cedulas):
            if ced not in self.periodos:
                pers, avisos = reconstruir_periodos_servicio(self.expedientes[ced].filas,
                                                             self._detalles_de(ced))
                self.periodos[ced], self.avisos_periodos[ced] = pers, avisos
            for a in self.avisos_periodos.get(ced, []):
                est.avisar(a)
            pers = self.periodos[ced]
            est.leidas += len(pers)
            est.en_alcance += len(pers)
            usados = {d for p in pers for d in p.get("_detalles", [])}
            for d in self._detalles_de(ced):
                if d.get("ID_EGRESO") not in usados:
                    self._descartar(det, "DETALLE_EGRESO", str(a_json(d.get("ID_EGRESO"))),
                                    "no se pudo asociar a un período de servicio",
                                    "personal.periodos_servicio")
            fid = self._fid(ced)
            if fid is None:
                for p in pers:
                    self._descartar(est, "PERIODOS", f"{ced}#{p['numero_periodo']}",
                                    "funcionario no migrado", "personal.periodos_servicio")
                    for x in p.get("_detalles", []):
                        self._descartar(det, "DETALLE_EGRESO", str(a_json(x)),
                                        "funcionario no migrado", "personal.periodos_servicio")
                continue
            for p in pers:
                valores = {k: v for k, v in p.items() if not k.startswith("_")}
                valores["funcionario_id"] = fid
                extra = {}
                if p.get("_detalles_extra"):
                    extra["DETALLE_EGRESO_adicionales"] = p["_detalles_extra"]
                filas.append(FilaDestino(
                    f"{ced}#{p['numero_periodo']}", valores, extra=extra,
                    trazas_extra=[("DETALLE_EGRESO", str(a_json(x)))
                                  for x in p.get("_detalles", [])]))
        ids = await self._cargar("PERIODOS", "personal.periodos_servicio", filas, est)
        for f in filas:
            if f.clave in ids:
                det.vinculadas += len(f.trazas_extra)
            else:
                for _, cl in f.trazas_extra:
                    self._descartar(det, "DETALLE_EGRESO", cl, "su período fue rechazado",
                                    "personal.periodos_servicio")
        await self._vaciar_descartes()

    async def _por_funcionario(self, tabla: str, col_cedula: str, unidad: str,
                               transformar: Any, agrupado: bool = False,
                               solape: tuple[str, str, bool] | None = None) -> None:
        m = MAPEOS[tabla]
        est = self.est(tabla)
        grupos = self.filtrar(tabla, col_cedula, est)
        if not self.escribe(unidad):
            return
        filas: list[FilaDestino] = []
        for ced, lst in sorted(grupos.items()):
            fid = self._fid(ced)
            if fid is None:
                for f in lst:
                    self._descartar(est, tabla, self._clave(tabla, f),
                                    "funcionario no migrado (descartado o fuera del alcance)",
                                    m.destino)
                continue
            if agrupado:
                pares = transformar(lst, fid, self.ctx)
            else:
                pares = [(f, transformar(f, fid, self.ctx)) for f in lst]
            previstas: dict[str, str] = {}
            if solape:
                ini, fin, cerrado = solape
                intervalos = [(self._clave(tabla, f), r.valores[ini], r.valores.get(fin))
                              for f, r in pares if r.ok]
                for k, otro in detectar_solapes(intervalos, cerrado).items():
                    previstas[k] = f"rechazado por el motor: solapamiento (previsto con {otro})"
                est.previstos_solape += len(previstas)
            for f, r in pares:
                clave = self._clave(tabla, f)
                self._anotar(est, r)
                if not r.ok:
                    self._descartar(est, tabla, clave, r.motivo or "?", m.destino)
                    continue
                extra = {} if m.extra_en == "metadata" else r.extra
                if m.extra_en == "metadata":
                    r.valores.setdefault("metadata", {"legacy_extra": r.extra})  # type: ignore
                filas.append(FilaDestino(clave, r.valores, extra=extra,
                                         rechazo_previsto=previstas.get(clave)))
        await self._cargar(tabla, m.destino, filas, est)

    # -- fases 4–8 ---------------------------------------------------------------
    async def historico_jerarquias(self) -> None:
        await self._por_funcionario("HISTORICO_JERARQUIA", "CEDULA", "historico_jerarquias",
                                    historico_jerarquias_from_legacy, agrupado=True,
                                    solape=("fecha_inicio", "fecha_fin", False))

    async def historico_ubicaciones(self) -> None:
        await self._por_funcionario("HISTORICO_UBICACION_ADMINISTRATIVA", "CEDULA",
                                    "historico_ubicaciones", historico_ubicaciones_from_legacy,
                                    agrupado=True)

    async def carga_familiar(self) -> None:
        await self._por_funcionario("CARGA_FAMILIAR", "CEDULA", "carga_familiar",
                                    carga_familiar_from_legacy)

    async def educacion(self) -> None:
        await self._por_funcionario("NIVEL_EDUCATIVO", "CEDULA", "educacion",
                                    educacion_from_legacy)

    async def reposos(self) -> None:
        await self._por_funcionario("REPOSOS", "CEDULA", "reposos", reposo_from_legacy,
                                    solape=("fecha_inicio", "fecha_fin", True))

    async def vacaciones(self) -> None:
        await self._por_funcionario("VACACIONES", "CEDULA", "vacaciones", vacacion_from_legacy,
                                    solape=("fecha_inicio", "fecha_fin", True))

    async def faltas(self) -> None:
        await self._por_funcionario("RECURRENCIA", "CEDULA_CUESTIONADO", "faltas",
                                    falta_from_legacy)

    async def cursos_realizados(self) -> None:
        await self._por_funcionario("EVALUACIONES_CURSOS", "CEDULA", "cursos_realizados",
                                    curso_realizado_from_legacy)

    async def ascensos(self) -> None:
        await self._por_funcionario("ASCENSOS", "CEDULA", "ascensos", ascensos_from_legacy,
                                    agrupado=True)

    async def evaluaciones(self) -> None:
        anios = set()
        for f in self.leer("EVALUACIONES"):
            if self.alcance.incluye(f.get("CEDULA")):
                d = parse_date(f.get("FECHA"))
                if d:
                    anios.add(d.year)
        if anios and self.escribe("evaluaciones"):
            await self.d.crear_catalogo("carrera.periodos_evaluacion", [
                {"codigo": f"LEG_{a}", "nombre": f"Año {a} (sistema anterior)",
                 "fecha_inicio": date(a, 1, 1), "fecha_fin": date(a, 12, 31)}
                for a in sorted(anios)])
        cods = codigos_catalogo(await self.d.catalogo("carrera.periodos_evaluacion"))
        self.ctx.periodos_evaluacion = {a: cods[f"LEG_{a}"] for a in anios
                                        if f"LEG_{a}" in cods}
        await self._por_funcionario("EVALUACIONES", "CEDULA", "evaluaciones",
                                    evaluacion_from_legacy)

    async def jubilados(self) -> None:
        def transformar(f: dict, fid: int, ctx: Contexto) -> Resultado:
            ced = parse_cedula(f.get("CEDULA"))
            pers = self.periodos.get(ced or -1, [])
            if pers and pers[-1]["fecha_egreso"] is None:
                return Resultado(None, motivo="figura en JUBILADOS pero su último período de "
                                              "servicio sigue abierto")
            ultimo = pers[-1]["fecha_egreso"] if pers else None
            return jubilado_from_legacy(f, fid, ultimo)

        await self._por_funcionario("JUBILADOS", "CEDULA", "jubilados", transformar)

    async def guardias(self) -> None:
        enc_est = self.est("ENC_GUARDIAS")
        det_est = self.est("DET_GUARDIAS")
        detalles = self.filtrar("DET_GUARDIAS", "CEDULA", det_est)
        encabezados = self.leer("ENC_GUARDIAS")
        enc_est.leidas = len(encabezados)
        # Con --zona solo entran los encabezados que tienen algún funcionario del alcance.
        necesarios = None if self.alcance.zona is None else {
            parse_int(f.get("ID_ENCABEZADO")) for lst in detalles.values() for f in lst}
        por_clave: dict[tuple, FilaDestino] = {}
        enc_a_clave: dict[int, str] = {}
        for e in encabezados:
            idc = parse_int(e.get("ID_ENCABEZADO"))
            if idc is None or (necesarios is not None and idc not in necesarios):
                continue
            enc_est.en_alcance += 1
            r = guardia_from_legacy(e, self.ctx)
            self._anotar(enc_est, r)
            if not r.ok or r.valores is None:
                self._descartar(enc_est, "ENC_GUARDIAS", str(idc), r.motivo or "?",
                                "ops.guardias")
                continue
            v = r.valores
            k = (v["fecha"], v["estacion_id"], v["seccion"], v["turno"])
            if k in por_clave:
                # UNIQUE (fecha, estacion_id, seccion, turno): se fusiona con el primero.
                por_clave[k].trazas_extra.append(("ENC_GUARDIAS", str(idc)))
                enc_a_clave[idc] = por_clave[k].clave
                enc_est.vinculadas += 1
                enc_est.avisar("encabezados duplicados (misma fecha/estación/sección/turno) "
                               "fusionados en una sola guardia")
                continue
            por_clave[k] = FilaDestino(str(idc), v)
            enc_a_clave[idc] = str(idc)
        ids = await self._cargar("ENC_GUARDIAS", "ops.guardias", list(por_clave.values()),
                                 enc_est)
        filas: list[FilaDestino] = []
        vistos: set[tuple[int, int]] = set()
        for ced, lst in sorted(detalles.items()):
            fid = self._fid(ced)
            for f in lst:
                clave = self._clave("DET_GUARDIAS", f)
                if fid is None:
                    self._descartar(det_est, "DET_GUARDIAS", clave, "funcionario no migrado",
                                    "ops.guardia_funcionarios")
                    continue
                gid = ids.get(enc_a_clave.get(parse_int(f.get("ID_ENCABEZADO")) or -1, ""))
                if gid is None:
                    self._descartar(det_est, "DET_GUARDIAS", clave,
                                    "su encabezado de guardia no se migró",
                                    "ops.guardia_funcionarios")
                    continue
                r = guardia_funcionario_from_legacy(f, gid, fid)
                self._anotar(det_est, r)
                previsto = None
                if (gid, fid) in vistos:
                    previsto = ("rechazado por el motor: UniqueViolation "
                                "(guardia_id, funcionario_id) (previsto)")
                    det_est.previstos_solape += 1
                vistos.add((gid, fid))
                filas.append(FilaDestino(clave, r.valores, extra=r.extra,
                                         rechazo_previsto=previsto))
        await self._cargar("DET_GUARDIAS", "ops.guardia_funcionarios", filas, det_est)

    # -- inventario del origen ---------------------------------------------------
    def inventario(self) -> None:
        tablas = self.o.listar_tablas()
        presentes = {norm_col(n) for n, _ in tablas}
        mapeadas = {norm_col(t) for t in MAPEOS} | {norm_col(t) for t in TABLAS_APOYO}
        for nombre, filas in tablas:
            regla = motivo_exclusion(nombre)
            if regla:
                self.rep.excluidas.append({"tabla": nombre, "filas": filas, "regla": regla})
            elif norm_col(nombre) not in mapeadas:
                self.rep.no_mapeadas.append({"tabla": nombre, "filas": filas})
        self.rep.ausentes = sorted(t for t in MAPEOS if norm_col(t) not in presentes)

    # -- ejecución -----------------------------------------------------------------
    async def ejecutar(self) -> ReporteMigracion:
        self.inventario()
        self.rep.corrida_id = await self.d.iniciar_corrida(
            self.op.modo, self.op.zona,
            {"only": self.op.only, "batch": self.op.batch, "zona": self.op.zona})
        await self.estructura()
        await self.salud_catalogos()
        await self.preparar_alcance()
        await self.funcionarios()  # siempre: resuelve ids aunque no escriba
        if self.escribe("periodos_servicio"):
            await self.periodos_servicio()
        pasos = [
            ("historico_jerarquias", self.historico_jerarquias),
            ("historico_ubicaciones", self.historico_ubicaciones),
            ("carga_familiar", self.carga_familiar),
            ("educacion", self.educacion),
            ("reposos", self.reposos),
            ("vacaciones", self.vacaciones),
            ("faltas", self.faltas),
            ("guardias", self.guardias),
            ("cursos_realizados", self.cursos_realizados),
            ("ascensos", self.ascensos),
            ("evaluaciones", self.evaluaciones),
            ("jubilados", self.jubilados),
        ]
        for unidad, paso in pasos:
            if self.escribe(unidad):
                await paso()
        await self._vaciar_descartes()
        self.rep.fin = datetime.now()
        await self.d.cerrar_corrida(self.rep.como_dict())
        return self.rep


async def ejecutar_migracion(config: Config, op: Opciones,
                             origen: Origen | None = None) -> ReporteMigracion:
    origen = origen or OrigenSqlServer(config.legacy_dsn)
    destino: Any
    if op.solo_origen:
        destino = DestinoNulo()
    else:
        destino = DestinoPg(config.target_dsn, aplicar=op.aplicar, batch_size=op.batch)
    await destino.abrir()
    try:
        motor = Motor(origen, destino, op)
        rep = await motor.ejecutar()
    finally:
        await destino.terminar()
        origen.cerrar()
    return rep


def run(config: Config, op: Opciones, origen: Origen | None = None) -> ReporteMigracion:
    rep = asyncio.run(ejecutar_migracion(config, op, origen))
    rep.imprimir(console)
    ruta = rep.guardar(op.carpeta_reporte)
    console.print(f"\nReporte JSON: [bold]{ruta}[/]")
    return rep
