"use client";

/**
 * Renderizado declarativo de las 6 secciones del formulario de funcionario.
 *
 * Recibe el estado del form completo + un setter por campo y muestra
 * únicamente la sección activa. El resto se mantiene desmontado.
 *
 * No incluye <form>, navegación ni botones — eso es responsabilidad
 * del wrapper (NuevoForm / EditarForm) para poder ajustar contexto.
 *
 * El domicilio NO está aquí: vive en personal.direcciones (1:N) y se
 * gestiona desde la ficha de detalle del funcionario.
 */

import type { CatalogosFuncionario, Catalogo } from "@/lib/catalogos";
import FotoUpload from "./FotoUpload";
import type { FuncionarioFormData, SeccionId } from "./seccionesFuncionario";

type SetField = <K extends keyof FuncionarioFormData>(
  key: K,
  value: FuncionarioFormData[K],
) => void;

interface Props {
  seccion: SeccionId;
  data: FuncionarioFormData;
  setField: SetField;
  errores: Partial<Record<keyof FuncionarioFormData, string>>;
  catalogos: CatalogosFuncionario;
  esAlta: boolean;
  // Foto
  fotoUrlRemota: string | null;
  funcionarioId?: number;
  onFotoChange: (file: File | null) => void;
  // Solo en edición
  merito?: number | null;
  // Permisos del usuario actual — reservado para futuras sub-secciones restringidas.
  userRoles: string[];
}

export default function SeccionesFormFuncionario({
  seccion,
  data,
  setField,
  errores,
  catalogos,
  esAlta,
  fotoUrlRemota,
  funcionarioId,
  onFotoChange,
  merito,
}: Props) {
  // Filtrar estaciones por zona seleccionada (si hay).
  const zonaIdNum = data.zona_id ? Number(data.zona_id) : null;
  const estacionesFiltradas = zonaIdNum
    ? catalogos.estaciones.filter((e) => e.zona_id === zonaIdNum)
    : catalogos.estaciones;

  return (
    <>
      <Panel id="identidad" activa={seccion}>
        <SeccionIdentidad
          data={data}
          setField={setField}
          errores={errores}
          catalogos={catalogos}
          esAlta={esAlta}
          fotoUrlRemota={fotoUrlRemota}
          funcionarioId={funcionarioId}
          onFotoChange={onFotoChange}
        />
      </Panel>

      <Panel id="empleo" activa={seccion}>
        <SeccionEmpleo
          data={data}
          setField={setField}
          errores={errores}
          catalogos={catalogos}
          esAlta={esAlta}
          merito={merito}
        />
      </Panel>

      <Panel id="ubicacion" activa={seccion}>
        <SeccionUbicacion
          data={data}
          setField={setField}
          catalogos={catalogos}
          estacionesFiltradas={estacionesFiltradas}
        />
      </Panel>

      <Panel id="contacto" activa={seccion}>
        <SeccionContacto data={data} setField={setField} errores={errores} />
      </Panel>

      <Panel id="educacion" activa={seccion}>
        <SeccionEducacion data={data} setField={setField} catalogos={catalogos} />
      </Panel>

      <Panel id="observaciones" activa={seccion}>
        <SeccionObservaciones data={data} setField={setField} />
      </Panel>
    </>
  );
}

/* ── Panel envolvente con role="tabpanel" ── */

function Panel({
  id,
  activa,
  children,
}: {
  id: SeccionId;
  activa: SeccionId;
  children: React.ReactNode;
}) {
  const visible = id === activa;
  return (
    <section
      id={`panel-${id}`}
      role="tabpanel"
      aria-label={`Sección ${id}`}
      hidden={!visible}
      className={visible ? "bg-card border border-border rounded-xl p-6" : ""}
    >
      {visible ? children : null}
    </section>
  );
}

/* ── Helpers ── */

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  title,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium mb-1"
        title={title}
      >
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
      )}
      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="mt-1 text-[11px] text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

function CheckboxField({
  label,
  id,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={[
        "flex items-start gap-2 rounded-md border border-border bg-background px-3 py-2.5 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-pointer hover:bg-accent/40",
      ].join(" ")}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
      />
      <span className="flex flex-col">
        <span className="text-sm font-medium leading-tight">{label}</span>
        {hint && (
          <span className="text-[10px] text-muted-foreground mt-0.5">{hint}</span>
        )}
      </span>
    </label>
  );
}

function opcionesCatalogo(cat: Catalogo[]) {
  return cat.map((c) => (
    <option key={c.id} value={c.id}>
      {c.nombre}
    </option>
  ));
}

/* ── IDENTIDAD ── */

function SeccionIdentidad({
  data,
  setField,
  errores,
  catalogos,
  esAlta,
  fotoUrlRemota,
  funcionarioId,
  onFotoChange,
}: {
  data: FuncionarioFormData;
  setField: SetField;
  errores: Partial<Record<keyof FuncionarioFormData, string>>;
  catalogos: CatalogosFuncionario;
  esAlta: boolean;
  fotoUrlRemota: string | null;
  funcionarioId?: number;
  onFotoChange: (file: File | null) => void;
}) {
  // Nacionalidad y cédula no se pueden modificar tras crear (identidad inmutable).
  const idDeshabilitada = !esAlta;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6">
        <div className="flex justify-center md:justify-start">
          <FotoUpload
            fotoUrl={fotoUrlRemota}
            funcionarioId={funcionarioId}
            onChange={onFotoChange}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Nacionalidad"
            htmlFor="nacionalidad"
            required
            hint={idDeshabilitada ? "No editable tras el alta" : undefined}
          >
            <select
              id="nacionalidad"
              value={data.nacionalidad}
              onChange={(e) => setField("nacionalidad", e.target.value)}
              className="input disabled:opacity-60"
              required
              disabled={idDeshabilitada}
            >
              <option value="V">Venezolano</option>
              <option value="E">Extranjero</option>
            </select>
          </Field>

          <Field
            label="Cédula"
            htmlFor="cedula"
            required
            error={errores.cedula}
            hint={idDeshabilitada ? "No editable tras el alta" : undefined}
            className="sm:col-span-2"
          >
            <input
              id="cedula"
              type="number"
              inputMode="numeric"
              min={1}
              value={data.cedula}
              onChange={(e) => setField("cedula", e.target.value)}
              className="input disabled:opacity-60"
              required
              disabled={idDeshabilitada}
              readOnly={idDeshabilitada}
            />
          </Field>

          <Field label="RIF" htmlFor="rif" hint="Opcional · máx 20 caracteres">
            <input
              id="rif"
              maxLength={20}
              value={data.rif}
              onChange={(e) => setField("rif", e.target.value)}
              className="input"
            />
          </Field>

          <Field
            label="Apellidos"
            htmlFor="apellidos"
            required
            error={errores.apellidos}
            className="sm:col-span-2"
          >
            <input
              id="apellidos"
              minLength={2}
              maxLength={100}
              value={data.apellidos}
              onChange={(e) => setField("apellidos", e.target.value)}
              className="input"
              required
            />
          </Field>

          <Field
            label="Nombres"
            htmlFor="nombres"
            required
            error={errores.nombres}
            className="sm:col-span-2"
          >
            <input
              id="nombres"
              minLength={2}
              maxLength={100}
              value={data.nombres}
              onChange={(e) => setField("nombres", e.target.value)}
              className="input"
              required
            />
          </Field>

          <Field label="Fecha de nacimiento" htmlFor="fecha_nacimiento">
            <input
              id="fecha_nacimiento"
              type="date"
              value={data.fecha_nacimiento}
              onChange={(e) => setField("fecha_nacimiento", e.target.value)}
              className="input"
            />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Field label="Sexo" htmlFor="sexo">
          <select
            id="sexo"
            value={data.sexo}
            onChange={(e) => setField("sexo", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </Field>

        <Field label="Estado civil" htmlFor="estado_civil_id">
          <select
            id="estado_civil_id"
            value={data.estado_civil_id}
            onChange={(e) => setField("estado_civil_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.estadosCiviles)}
          </select>
        </Field>

        <Field label="Grupo sanguíneo" htmlFor="grupo_sanguineo_id">
          <select
            id="grupo_sanguineo_id"
            value={data.grupo_sanguineo_id}
            onChange={(e) => setField("grupo_sanguineo_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.gruposSanguineos)}
          </select>
        </Field>

        <Field label="Factor RH" htmlFor="factor_sanguineo">
          <select
            id="factor_sanguineo"
            value={data.factor_sanguineo}
            onChange={(e) => setField("factor_sanguineo", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            <option value="+">Positivo (+)</option>
            <option value="-">Negativo (−)</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Lugar de nacimiento" htmlFor="lugar_nacimiento">
          <input
            id="lugar_nacimiento"
            maxLength={120}
            value={data.lugar_nacimiento}
            onChange={(e) => setField("lugar_nacimiento", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="País de nacimiento" htmlFor="pais_nacimiento">
          <input
            id="pais_nacimiento"
            maxLength={80}
            value={data.pais_nacimiento}
            onChange={(e) => setField("pais_nacimiento", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      {/* Nacionalización (si aplica) */}
      <fieldset className="rounded-md border border-border bg-muted/30 p-4 space-y-4">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nacionalización (si aplica)
        </legend>
        <p className="text-[11px] text-muted-foreground -mt-2">
          Solo completar si el funcionario es nacionalizado venezolano.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Tipo de nacionalización" htmlFor="tipo_nacionalizacion">
            <input
              id="tipo_nacionalizacion"
              maxLength={60}
              value={data.tipo_nacionalizacion}
              onChange={(e) => setField("tipo_nacionalizacion", e.target.value)}
              className="input"
              placeholder="Ej: Por matrimonio, residencia…"
            />
          </Field>

          <Field label="Fecha de nacionalización" htmlFor="fecha_nacionalizacion">
            <input
              id="fecha_nacionalizacion"
              type="date"
              value={data.fecha_nacionalizacion}
              onChange={(e) => setField("fecha_nacionalizacion", e.target.value)}
              className="input"
            />
          </Field>

          <Field
            label="Nº de gaceta"
            htmlFor="numero_gaceta_nacionalizacion"
          >
            <input
              id="numero_gaceta_nacionalizacion"
              maxLength={60}
              value={data.numero_gaceta_nacionalizacion}
              onChange={(e) =>
                setField("numero_gaceta_nacionalizacion", e.target.value)
              }
              className="input"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="País de origen" htmlFor="pais_origen">
            <input
              id="pais_origen"
              maxLength={80}
              value={data.pais_origen}
              onChange={(e) => setField("pais_origen", e.target.value)}
              className="input"
            />
          </Field>

          <Field
            label="Idiomas"
            htmlFor="idiomas"
            hint="Separa varios con coma (ej: español, inglés)"
          >
            <input
              id="idiomas"
              maxLength={160}
              value={data.idiomas}
              onChange={(e) => setField("idiomas", e.target.value)}
              className="input"
            />
          </Field>
        </div>
      </fieldset>
    </div>
  );
}

/* ── EMPLEO ── */

function SeccionEmpleo({
  data,
  setField,
  errores,
  catalogos,
  esAlta,
  merito,
}: {
  data: FuncionarioFormData;
  setField: SetField;
  errores: Partial<Record<keyof FuncionarioFormData, string>>;
  catalogos: CatalogosFuncionario;
  esAlta: boolean;
  merito?: number | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Tipo de personal" htmlFor="tipo_personal">
          <select
            id="tipo_personal"
            value={data.tipo_personal}
            onChange={(e) => setField("tipo_personal", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {catalogos.tiposPersonal.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Nº empleado" htmlFor="numero_empleado">
          <input
            id="numero_empleado"
            maxLength={20}
            value={data.numero_empleado}
            onChange={(e) => setField("numero_empleado", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Nº equipo" htmlFor="numero_equipo">
          <input
            id="numero_equipo"
            maxLength={20}
            value={data.numero_equipo}
            onChange={(e) => setField("numero_equipo", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field
          label="Fecha de primer ingreso"
          htmlFor="fecha_primer_ingreso"
          required={esAlta}
          error={errores.fecha_primer_ingreso}
          hint={esAlta ? "Genera el período de servicio inicial" : undefined}
        >
          <input
            id="fecha_primer_ingreso"
            type="date"
            value={data.fecha_primer_ingreso}
            onChange={(e) => setField("fecha_primer_ingreso", e.target.value)}
            className="input"
            required={esAlta}
          />
        </Field>

        <Field label="Promoción" htmlFor="promocion">
          <input
            id="promocion"
            maxLength={60}
            value={data.promocion}
            onChange={(e) => setField("promocion", e.target.value)}
            className="input"
          />
        </Field>

        <Field
          label="Estatus"
          htmlFor="estatus"
          hint={esAlta ? "Por defecto Activo. Cambia solo si vas a importar data legacy." : undefined}
        >
          <select
            id="estatus"
            value={data.estatus || (esAlta ? "Activo" : "")}
            onChange={(e) => setField("estatus", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {catalogos.estatusFuncionario.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Condición" htmlFor="condicion_id">
          <select
            id="condicion_id"
            value={data.condicion_id}
            onChange={(e) => setField("condicion_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.condiciones)}
          </select>
        </Field>

        <Field label="Jerarquía" htmlFor="jerarquia_id">
          <select
            id="jerarquia_id"
            value={data.jerarquia_id}
            onChange={(e) => setField("jerarquia_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.jerarquias)}
          </select>
        </Field>

        <Field label="Cargo" htmlFor="cargo_id">
          <select
            id="cargo_id"
            value={data.cargo_id}
            onChange={(e) => setField("cargo_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.cargos)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Institución formadora"
          htmlFor="institucion_formadora_id"
          hint="Reemplaza los antiguos checkboxes IUTB / UNES"
        >
          <select
            id="institucion_formadora_id"
            value={data.institucion_formadora_id}
            onChange={(e) =>
              setField("institucion_formadora_id", e.target.value)
            }
            className="input"
          >
            <option value="">Ninguna</option>
            {opcionesCatalogo(catalogos.institucionesFormadoras)}
          </select>
        </Field>

        <Field
          label="Licencia de conducir"
          htmlFor="licencia_conducir"
          hint="Ej: B+, C, D"
        >
          <input
            id="licencia_conducir"
            maxLength={10}
            value={data.licencia_conducir}
            onChange={(e) => setField("licencia_conducir", e.target.value)}
            className="input uppercase"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CheckboxField
          id="es_voluntario"
          label="Voluntario"
          checked={data.es_voluntario}
          onChange={(v) => setField("es_voluntario", v)}
          hint="Personal voluntario (no remunerado)"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Fecha de egreso" htmlFor="fecha_egreso">
          <input
            id="fecha_egreso"
            type="date"
            value={data.fecha_egreso}
            onChange={(e) => setField("fecha_egreso", e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Fecha de reintegro" htmlFor="fecha_reintegro">
          <input
            id="fecha_reintegro"
            type="date"
            value={data.fecha_reintegro}
            onChange={(e) => setField("fecha_reintegro", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      {/* Datos históricos legacy */}
      <fieldset className="rounded-md border border-dashed border-border bg-muted/20 p-4 space-y-3">
        <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Datos históricos legacy
        </legend>
        <p className="text-[11px] text-muted-foreground -mt-1">
          Solo completar si aplica información histórica del funcionario.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Fecha ingreso ESTE"
            htmlFor="fecha_este"
            title="Fecha de ingreso al escalafón ESTE (histórico)"
            hint="Histórico — escalafón ESTE"
          >
            <input
              id="fecha_este"
              type="date"
              value={data.fecha_este}
              onChange={(e) => setField("fecha_este", e.target.value)}
              className="input"
              title="Fecha de ingreso al escalafón ESTE (histórico)"
            />
          </Field>

          <Field
            label="Fecha ingreso GDF"
            htmlFor="fecha_ingreso_gdf"
            title="Fecha de ingreso al GDF (histórico)"
            hint="Histórico — Gobierno del Distrito Federal"
          >
            <input
              id="fecha_ingreso_gdf"
              type="date"
              value={data.fecha_ingreso_gdf}
              onChange={(e) => setField("fecha_ingreso_gdf", e.target.value)}
              className="input"
              title="Fecha de ingreso al GDF (histórico)"
            />
          </Field>
        </div>
      </fieldset>

      {!esAlta && merito !== undefined && merito !== null && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Mérito acumulado
          </span>
          <div className="mt-1 font-mono text-lg font-semibold">
            {merito.toFixed(2)} <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── UBICACIÓN ── */

function SeccionUbicacion({
  data,
  setField,
  catalogos,
  estacionesFiltradas,
}: {
  data: FuncionarioFormData;
  setField: SetField;
  catalogos: CatalogosFuncionario;
  estacionesFiltradas: CatalogosFuncionario["estaciones"];
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field
          label="Zona"
          htmlFor="zona_id"
          hint="Al cambiar la zona se filtran las estaciones"
        >
          <select
            id="zona_id"
            value={data.zona_id}
            onChange={(e) => {
              setField("zona_id", e.target.value);
              // si la estación actual no pertenece a la nueva zona, resetear
              const nuevaZona = e.target.value ? Number(e.target.value) : null;
              if (data.estacion_id) {
                const est = catalogos.estaciones.find(
                  (x) => x.id === Number(data.estacion_id),
                );
                if (est && nuevaZona !== null && est.zona_id !== nuevaZona) {
                  setField("estacion_id", "");
                }
              }
            }}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.zonas)}
          </select>
        </Field>

        <Field label="Estación" htmlFor="estacion_id">
          <select
            id="estacion_id"
            value={data.estacion_id}
            onChange={(e) => setField("estacion_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(estacionesFiltradas)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Área" htmlFor="area_id">
          <select
            id="area_id"
            value={data.area_id}
            onChange={(e) => setField("area_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.areas)}
          </select>
        </Field>

        <Field label="Dependencia" htmlFor="dependencia_id">
          <select
            id="dependencia_id"
            value={data.dependencia_id}
            onChange={(e) => setField("dependencia_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.dependencias)}
          </select>
        </Field>

        <Field label="División" htmlFor="division_id">
          <select
            id="division_id"
            value={data.division_id}
            onChange={(e) => setField("division_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.divisiones)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Sección" htmlFor="seccion" hint="Una letra A-Z">
          <input
            id="seccion"
            maxLength={1}
            value={data.seccion}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              if (v === "" || /^[A-Z]$/.test(v)) setField("seccion", v);
            }}
            pattern="[A-Z]"
            className="input uppercase"
          />
        </Field>

        <Field label="Horario" htmlFor="horario" className="md:col-span-2">
          <input
            id="horario"
            maxLength={80}
            value={data.horario}
            onChange={(e) => setField("horario", e.target.value)}
            className="input"
            placeholder="Ej: Lun–Vie 8:00–16:00"
          />
        </Field>
      </div>
    </div>
  );
}

/* ── CONTACTO ── */

function SeccionContacto({
  data,
  setField,
  errores,
}: {
  data: FuncionarioFormData;
  setField: SetField;
  errores: Partial<Record<keyof FuncionarioFormData, string>>;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Teléfono habitación" htmlFor="telefono_habitacion">
          <input
            id="telefono_habitacion"
            maxLength={30}
            value={data.telefono_habitacion}
            onChange={(e) => setField("telefono_habitacion", e.target.value)}
            className="input"
            placeholder="+58 212 555-0100"
          />
        </Field>

        <Field label="Teléfono móvil" htmlFor="telefono_movil">
          <input
            id="telefono_movil"
            maxLength={30}
            value={data.telefono_movil}
            onChange={(e) => setField("telefono_movil", e.target.value)}
            className="input"
            placeholder="+58 414 555-0100"
          />
        </Field>

        <Field label="Teléfono otros" htmlFor="telefono_otros">
          <input
            id="telefono_otros"
            maxLength={30}
            value={data.telefono_otros}
            onChange={(e) => setField("telefono_otros", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <Field label="Correo electrónico" htmlFor="correo" error={errores.correo}>
        <input
          id="correo"
          type="email"
          value={data.correo}
          onChange={(e) => setField("correo", e.target.value)}
          className="input"
          placeholder="nombre@ejemplo.com"
        />
      </Field>

      <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Contacto de emergencia
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Persona de contacto" htmlFor="persona_contacto">
            <input
              id="persona_contacto"
              maxLength={120}
              value={data.persona_contacto}
              onChange={(e) => setField("persona_contacto", e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Teléfono contacto" htmlFor="telefono_contacto">
            <input
              id="telefono_contacto"
              maxLength={30}
              value={data.telefono_contacto}
              onChange={(e) => setField("telefono_contacto", e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Parentesco" htmlFor="parentesco_contacto">
            <input
              id="parentesco_contacto"
              maxLength={40}
              value={data.parentesco_contacto}
              onChange={(e) => setField("parentesco_contacto", e.target.value)}
              className="input"
              placeholder="Madre, esposo/a…"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

/* ── EDUCACIÓN ── */

function SeccionEducacion({
  data,
  setField,
  catalogos,
}: {
  data: FuncionarioFormData;
  setField: SetField;
  catalogos: CatalogosFuncionario;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nivel educativo" htmlFor="nivel_educativo_id">
          <select
            id="nivel_educativo_id"
            value={data.nivel_educativo_id}
            onChange={(e) => setField("nivel_educativo_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.nivelesEducativos)}
          </select>
        </Field>

        <Field label="Especialidad" htmlFor="especialidad_id">
          <select
            id="especialidad_id"
            value={data.especialidad_id}
            onChange={(e) => setField("especialidad_id", e.target.value)}
            className="input"
          >
            <option value="">—</option>
            {opcionesCatalogo(catalogos.especialidades)}
          </select>
        </Field>
      </div>

      <Field label="Profesión" htmlFor="profesion">
        <input
          id="profesion"
          maxLength={120}
          value={data.profesion}
          onChange={(e) => setField("profesion", e.target.value)}
          className="input"
        />
      </Field>

      <p className="text-[11px] text-muted-foreground">
        La institución formadora (IUTB, UNES, etc.) se gestiona desde la sección Empleo.
      </p>
    </div>
  );
}

/* ── OBSERVACIONES ── */

function SeccionObservaciones({
  data,
  setField,
}: {
  data: FuncionarioFormData;
  setField: SetField;
}) {
  return (
    <Field label="Observaciones" htmlFor="observaciones">
      <textarea
        id="observaciones"
        rows={10}
        value={data.observaciones}
        onChange={(e) => setField("observaciones", e.target.value)}
        className="input min-h-[200px] resize-y"
        placeholder="Notas relevantes sobre el funcionario…"
      />
    </Field>
  );
}
