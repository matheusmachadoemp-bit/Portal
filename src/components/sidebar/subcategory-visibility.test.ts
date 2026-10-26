import { test } from "node:test";
import assert from "node:assert/strict";
import { isSubcategoryVisible } from "./subcategory-visibility";
import type { SubcategoryDTO } from "./types";

function makeSub(overrides: Partial<SubcategoryDTO> = {}): SubcategoryDTO {
  return {
    id: "sub-1",
    categoryId: "cat-1",
    key: "sashimis",
    name: "Sashimis",
    icon: "Folder",
    color: "#2952E3",
    order: 0,
    active: true,
    isSystem: true,
    empresaId: null,
    ...overrides,
  };
}

test("subcategoria desativada: admin continua vendo (pra poder reativar/gerenciar)", () => {
  const sub = makeSub({ active: false });
  const visible = isSubcategoryVisible(sub, {
    activeEmpresaId: "empresa-1",
    isGrupoNord: false,
    isAdmin: true,
  });
  assert.equal(visible, true);
});

test("subcategoria desativada: usuário não-admin NÃO vê mais (corrige o 404 ao clicar)", () => {
  const sub = makeSub({ active: false });
  const visible = isSubcategoryVisible(sub, {
    activeEmpresaId: "empresa-1",
    isGrupoNord: false,
    isAdmin: false,
  });
  assert.equal(visible, false);
});

test("subcategoria ativa: aparece pra admin e pra não-admin", () => {
  const sub = makeSub({ active: true });
  for (const isAdmin of [true, false]) {
    const visible = isSubcategoryVisible(sub, {
      activeEmpresaId: "empresa-1",
      isGrupoNord: false,
      isAdmin,
    });
    assert.equal(visible, true, `isAdmin=${isAdmin}`);
  }
});

test("filtro de loja continua funcionando junto com o filtro de status (empresaId diferente da ativa)", () => {
  const sub = makeSub({ active: true, empresaId: "empresa-2" });
  const visible = isSubcategoryVisible(sub, {
    activeEmpresaId: "empresa-1",
    isGrupoNord: false,
    isAdmin: true,
  });
  assert.equal(visible, false);
});

test("filtro de loja: empresaId null sempre aparece (se ativa), igual já era antes", () => {
  const sub = makeSub({ active: true, empresaId: null });
  const visible = isSubcategoryVisible(sub, {
    activeEmpresaId: "empresa-1",
    isGrupoNord: false,
    isAdmin: false,
  });
  assert.equal(visible, true);
});

test("modo Grupo Nord: ignora empresaId mesmo diferente da loja ativa, mas ainda respeita active+isAdmin", () => {
  const ativaOutraLoja = makeSub({ active: true, empresaId: "empresa-2" });
  assert.equal(
    isSubcategoryVisible(ativaOutraLoja, { activeEmpresaId: "empresa-1", isGrupoNord: true, isAdmin: false }),
    true
  );

  const inativaOutraLoja = makeSub({ active: false, empresaId: "empresa-2" });
  assert.equal(
    isSubcategoryVisible(inativaOutraLoja, { activeEmpresaId: "empresa-1", isGrupoNord: true, isAdmin: false }),
    false
  );
  assert.equal(
    isSubcategoryVisible(inativaOutraLoja, { activeEmpresaId: "empresa-1", isGrupoNord: true, isAdmin: true }),
    true
  );
});
