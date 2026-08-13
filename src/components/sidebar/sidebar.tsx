"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  GripVertical,
  LogOut,
  MoreVertical,
  Plus,
  Search,
  RotateCcw,
} from "lucide-react";
import { DynamicIcon } from "@/components/dynamic-icon";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { IconPicker, ColorPicker } from "@/components/ui/icon-picker";
import { logoutAction } from "@/app/actions/logout";
import { StoreSwitcher } from "./store-switcher";
import type { CategoryDTO, SubcategoryDTO } from "./types";

export function Sidebar({
  initialCategories,
  userName,
  userRole,
  empresas,
  activeEmpresaId,
  canViewGrupoNord,
}: {
  initialCategories: CategoryDTO[];
  userName: string;
  userRole: string;
  empresas: { id: string; key: string; name: string; color: string; logo: string | null }[];
  activeEmpresaId: string;
  canViewGrupoNord: boolean;
}) {
  const [categories, setCategories] = useState<CategoryDTO[]>(initialCategories);
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryDTO | null>(null);
  const [newSubFor, setNewSubFor] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<SubcategoryDTO | null>(null);
  const [moveSub, setMoveSub] = useState<SubcategoryDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    { type: "category" | "subcategory"; id: string; name: string } | null
  >(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  const isAdmin = userRole === "ADMINISTRADOR" || userRole === "GESTOR";

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    const activeKey = categories.find((c) => pathname.startsWith(`/portal/${c.key}`))?.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs expanded menu section to the active route
    if (activeKey) setExpanded((e) => ({ ...e, [activeKey]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const filtered = useMemo(() => {
    if (!query.trim()) return categories;
    const q = query.toLowerCase();
    return categories
      .map((c) => ({
        ...c,
        subcategories: c.subcategories.filter((s) => s.name.toLowerCase().includes(q)),
      }))
      .filter((c) => c.name.toLowerCase().includes(q) || c.subcategories.length > 0);
  }, [categories, query]);

  async function persistCategoryOrder(items: CategoryDTO[]) {
    await fetch("/api/menu/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "category",
        items: items.map((c, i) => ({ id: c.id, order: i })),
      }),
    });
  }

  async function persistSubcategoryOrder(categoryId: string, items: SubcategoryDTO[]) {
    await fetch("/api/menu/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subcategory",
        items: items.map((s, i) => ({ id: s.id, order: i, categoryId })),
      }),
    });
  }

  function handleCategoryDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCategories((prev) => {
      const oldIndex = prev.findIndex((c) => c.id === active.id);
      const newIndex = prev.findIndex((c) => c.id === over.id);
      const next = arrayMove(prev, oldIndex, newIndex);
      persistCategoryOrder(next);
      return next;
    });
  }

  function handleSubDragEnd(categoryId: string, e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== categoryId) return c;
        const oldIndex = c.subcategories.findIndex((s) => s.id === active.id);
        const newIndex = c.subcategories.findIndex((s) => s.id === over.id);
        const next = arrayMove(c.subcategories, oldIndex, newIndex);
        persistSubcategoryOrder(categoryId, next);
        return { ...c, subcategories: next };
      })
    );
  }

  async function refresh() {
    const res = await fetch("/api/menu");
    const data = await res.json();
    setCategories(data.categories);
  }

  async function toggleCategoryActive(cat: CategoryDTO) {
    await fetch(`/api/menu/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !cat.active }),
    });
    refresh();
  }

  async function toggleSubActive(sub: SubcategoryDTO) {
    await fetch(`/api/menu/subcategories/${sub.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sub.active }),
    });
    refresh();
  }

  async function duplicateCategory(cat: CategoryDTO) {
    await fetch(`/api/menu/categories/${cat.id}/duplicate`, { method: "POST" });
    refresh();
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleteError(null);
    try {
      const res = await fetch(
        confirmDelete.type === "category"
          ? `/api/menu/categories/${confirmDelete.id}`
          : `/api/menu/subcategories/${confirmDelete.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Não foi possível excluir. Tente novamente.");
        return;
      }
      setConfirmDelete(null);
      refresh();
    } catch {
      setDeleteError("Falha de conexão ao excluir. Verifique sua internet e tente novamente.");
    }
  }

  async function doMoveSubcategory(toCategoryId: string) {
    if (!moveSub) return;
    await fetch("/api/menu/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "subcategory",
        items: [{ id: moveSub.id, order: 999, categoryId: toCategoryId }],
      }),
    });
    setMoveSub(null);
    refresh();
  }

  async function resetOrder() {
    await fetch("/api/menu/reset", { method: "POST" });
    setConfirmReset(false);
    refresh();
  }

  return (
    <aside
      className={`h-screen sticky top-0 flex flex-col bg-nord-panel border-r border-nord-border transition-all duration-200 ${
        collapsed ? "w-[76px]" : "w-72"
      }`}
    >
      <div className="flex items-center justify-between px-4 h-16 border-b border-nord-border">
        {!collapsed ? (
          <Link href="/portal">
            <Image src="/logo-nord.svg" alt="Nord" width={140} height={38} />
          </Link>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-nord-blue flex items-center justify-center text-white font-bold">
            N
          </div>
        )}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-nord-gray hover:text-white"
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
        </button>
      </div>

      <div className="pt-2">
        <StoreSwitcher
          empresas={empresas}
          activeEmpresaId={activeEmpresaId}
          canViewGrupoNord={canViewGrupoNord}
          collapsed={collapsed}
        />
      </div>

      {!collapsed && (
        <div className="px-3 pt-1">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-nord-gray" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-full bg-nord-card border border-nord-border rounded-lg pl-8 pr-2 py-1.5 text-sm text-white placeholder:text-nord-gray/60 outline-none focus:border-nord-blue"
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto nord-scrollbar px-2 py-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
          <SortableContext items={filtered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-1">
              {filtered.map((cat) => (
                <CategoryRow
                  key={cat.id}
                  cat={cat}
                  collapsed={collapsed}
                  expanded={!!expanded[cat.id]}
                  onToggleExpand={() =>
                    setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))
                  }
                  pathname={pathname}
                  router={router}
                  isAdmin={isAdmin}
                  onEdit={() => setEditCategory(cat)}
                  onDelete={() => setConfirmDelete({ type: "category", id: cat.id, name: cat.name })}
                  onDuplicate={() => duplicateCategory(cat)}
                  onToggleActive={() => toggleCategoryActive(cat)}
                  onAddSub={() => setNewSubFor(cat.id)}
                  onSubDragEnd={(e) => handleSubDragEnd(cat.id, e)}
                  sensors={sensors}
                  onEditSub={(s) => setEditSub(s)}
                  onDeleteSub={(s) => setConfirmDelete({ type: "subcategory", id: s.id, name: s.name })}
                  onToggleSubActive={(s) => toggleSubActive(s)}
                  onMoveSub={(s) => setMoveSub(s)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        {isAdmin && !collapsed && (
          <div className="mt-3 space-y-1.5">
            <button
              onClick={() => setShowNewCategory(true)}
              className="w-full flex items-center gap-2 text-sm text-nord-gray hover:text-white px-3 py-2 rounded-lg border border-dashed border-nord-border hover:border-nord-blue transition"
            >
              <Plus size={14} /> Nova categoria
            </button>
            <button
              onClick={() => setConfirmReset(true)}
              className="w-full flex items-center gap-2 text-xs text-nord-gray hover:text-white px-3 py-1.5 rounded-lg transition"
            >
              <RotateCcw size={12} /> Restaurar ordem padrão
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-nord-border p-3">
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="text-sm text-white font-medium truncate">{userName}</p>
            <p className="text-xs text-nord-gray">{userRole}</p>
          </div>
        )}
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-2 text-sm text-nord-gray hover:text-red-400 px-3 py-2 rounded-lg hover:bg-red-950/20 transition"
          >
            <LogOut size={16} /> {!collapsed && "Sair"}
          </button>
        </form>
      </div>

      {/* New category modal */}
      <CategoryFormModal
        open={showNewCategory}
        onClose={() => setShowNewCategory(false)}
        onSaved={() => {
          setShowNewCategory(false);
          refresh();
        }}
      />
      <CategoryFormModal
        key={editCategory?.id ?? "edit-category-empty"}
        open={!!editCategory}
        category={editCategory ?? undefined}
        onClose={() => setEditCategory(null)}
        onSaved={() => {
          setEditCategory(null);
          refresh();
        }}
      />
      <SubcategoryFormModal
        key={newSubFor ?? "new-sub-empty"}
        open={!!newSubFor}
        categoryId={newSubFor ?? undefined}
        onClose={() => setNewSubFor(null)}
        onSaved={() => {
          setNewSubFor(null);
          refresh();
        }}
      />
      <SubcategoryFormModal
        key={editSub?.id ?? "edit-sub-empty"}
        open={!!editSub}
        subcategory={editSub ?? undefined}
        onClose={() => setEditSub(null)}
        onSaved={() => {
          setEditSub(null);
          refresh();
        }}
      />

      <Modal open={!!moveSub} onClose={() => setMoveSub(null)} title="Mover subcategoria" widthClass="max-w-sm">
        <p className="text-sm text-nord-gray mb-4">
          Selecione a categoria de destino para <strong className="text-white">{moveSub?.name}</strong>.
          Essa ação será confirmada antes de aplicada.
        </p>
        <div className="space-y-2">
          {categories
            .filter((c) => c.id !== moveSub?.categoryId)
            .map((c) => (
              <button
                key={c.id}
                onClick={() => doMoveSubcategory(c.id)}
                className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg border border-nord-border hover:border-nord-blue text-white text-sm"
              >
                <DynamicIcon name={c.icon} size={14} />
                {c.name}
              </button>
            ))}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`Excluir ${confirmDelete?.type === "category" ? "categoria" : "subcategoria"}`}
        message={
          deleteError ??
          `Tem certeza que deseja excluir "${confirmDelete?.name}"? Essa ação não poderá ser desfeita.`
        }
        onConfirm={doDelete}
        onCancel={() => {
          setConfirmDelete(null);
          setDeleteError(null);
        }}
        confirmLabel={deleteError ? "Tentar novamente" : "Excluir"}
        danger
      />

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar ordem padrão"
        message="Isso irá restaurar a ordem original das categorias e subcategorias do sistema. Deseja continuar?"
        onConfirm={resetOrder}
        onCancel={() => setConfirmReset(false)}
        confirmLabel="Restaurar"
      />
    </aside>
  );
}

function CategoryRow({
  cat,
  collapsed,
  expanded,
  onToggleExpand,
  pathname,
  router,
  isAdmin,
  onEdit,
  onDelete,
  onDuplicate,
  onToggleActive,
  onAddSub,
  onSubDragEnd,
  sensors,
  onEditSub,
  onDeleteSub,
  onToggleSubActive,
  onMoveSub,
}: {
  cat: CategoryDTO;
  collapsed: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleActive: () => void;
  onAddSub: () => void;
  onSubDragEnd: (e: DragEndEvent) => void;
  sensors: ReturnType<typeof useSensors>;
  onEditSub: (s: SubcategoryDTO) => void;
  onDeleteSub: (s: SubcategoryDTO) => void;
  onToggleSubActive: (s: SubcategoryDTO) => void;
  onMoveSub: (s: SubcategoryDTO) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cat.id,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const active = pathname.startsWith(`/portal/${cat.key}`);
  const hasSubs = cat.subcategories.length > 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : cat.active ? 1 : 0.45,
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        className={`group flex items-center gap-1 rounded-lg px-1.5 py-1.5 ${
          active ? "bg-nord-blue/15" : "hover:bg-white/5"
        }`}
      >
        {isAdmin && !collapsed && (
          <button {...attributes} {...listeners} className="text-nord-gray/50 hover:text-white cursor-grab shrink-0">
            <GripVertical size={14} />
          </button>
        )}
        <button
          onClick={() => {
            router.push(`/portal/${cat.key}`);
            if (hasSubs) onToggleExpand();
          }}
          className={`flex-1 flex items-center gap-2.5 text-sm py-1 min-w-0 ${
            active ? "text-white font-medium" : "text-nord-gray hover:text-white"
          }`}
        >
          <DynamicIcon name={cat.icon} size={17} style={{ color: active ? cat.color : undefined }} />
          {!collapsed && <span className="truncate">{cat.name}</span>}
        </button>
        {!collapsed && hasSubs && (
          <button onClick={onToggleExpand} className="text-nord-gray/60 hover:text-white shrink-0">
            <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
        {isAdmin && !collapsed && (
          <div className="relative shrink-0">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-nord-gray/60 hover:text-white opacity-0 group-hover:opacity-100"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <RowMenu
                onClose={() => setMenuOpen(false)}
                items={[
                  { label: "Adicionar subcategoria", onClick: onAddSub },
                  { label: "Editar", onClick: onEdit },
                  { label: "Duplicar", onClick: onDuplicate },
                  { label: cat.active ? "Desativar" : "Ativar", onClick: onToggleActive },
                  ...(cat.isSystem ? [] : [{ label: "Excluir", onClick: onDelete, danger: true }]),
                ]}
              />
            )}
          </div>
        )}
      </div>

      {!collapsed && expanded && hasSubs && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onSubDragEnd}>
          <SortableContext items={cat.subcategories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="ml-6 mt-0.5 space-y-0.5 border-l border-nord-border pl-2">
              {cat.subcategories.map((sub) => (
                <SubRow
                  key={sub.id}
                  sub={sub}
                  cat={cat}
                  pathname={pathname}
                  router={router}
                  isAdmin={isAdmin}
                  onEdit={() => onEditSub(sub)}
                  onDelete={() => onDeleteSub(sub)}
                  onToggleActive={() => onToggleSubActive(sub)}
                  onMove={() => onMoveSub(sub)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </li>
  );
}

function SubRow({
  sub,
  cat,
  pathname,
  router,
  isAdmin,
  onEdit,
  onDelete,
  onToggleActive,
  onMove,
}: {
  sub: SubcategoryDTO;
  cat: CategoryDTO;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onMove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sub.id,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const active = pathname === `/portal/${cat.key}/${sub.key}`;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : sub.active ? 1 : 0.45,
  };

  return (
    <li ref={setNodeRef} style={style} className="group flex items-center gap-1">
      {isAdmin && (
        <button {...attributes} {...listeners} className="text-nord-gray/40 hover:text-white cursor-grab shrink-0">
          <GripVertical size={12} />
        </button>
      )}
      <button
        onClick={() => router.push(`/portal/${cat.key}/${sub.key}`)}
        className={`flex-1 flex items-center gap-2 text-[13px] py-1 min-w-0 ${
          active ? "text-white font-medium" : "text-nord-gray hover:text-white"
        }`}
      >
        <DynamicIcon name={sub.icon} size={14} />
        <span className="truncate">{sub.name}</span>
      </button>
      {isAdmin && (
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="text-nord-gray/50 hover:text-white opacity-0 group-hover:opacity-100"
          >
            <MoreVertical size={12} />
          </button>
          {menuOpen && (
            <RowMenu
              onClose={() => setMenuOpen(false)}
              items={[
                { label: "Editar", onClick: onEdit },
                { label: "Mover para outra categoria", onClick: onMove },
                { label: sub.active ? "Desativar" : "Ativar", onClick: onToggleActive },
                ...(sub.isSystem ? [] : [{ label: "Excluir", onClick: onDelete, danger: true }]),
              ]}
            />
          )}
        </div>
      )}
    </li>
  );
}

function RowMenu({
  items,
  onClose,
}: {
  items: { label: string; onClick: () => void; danger?: boolean }[];
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-6 z-50 w-52 nord-card bg-nord-card shadow-xl py-1">
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              item.onClick();
              onClose();
            }}
            className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 ${
              item.danger ? "text-red-400" : "text-nord-gray hover:text-white"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

function CategoryFormModal({
  open,
  category,
  onClose,
  onSaved,
}: {
  open: boolean;
  category?: CategoryDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "LayoutGrid");
  const [color, setColor] = useState(category?.color ?? "#1464F4");

  async function submit() {
    if (category) {
      await fetch(`/api/menu/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, color }),
      });
    } else {
      await fetch("/api/menu", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, color }),
      });
    }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={category ? "Editar categoria" : "Nova categoria"}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-nord-blue"
          />
        </div>
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Ícone</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Cor</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}

function SubcategoryFormModal({
  open,
  subcategory,
  categoryId,
  onClose,
  onSaved,
}: {
  open: boolean;
  subcategory?: SubcategoryDTO;
  categoryId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(subcategory?.name ?? "");
  const [icon, setIcon] = useState(subcategory?.icon ?? "Folder");
  const [color, setColor] = useState(subcategory?.color ?? "#1464F4");

  async function submit() {
    if (subcategory) {
      await fetch(`/api/menu/subcategories/${subcategory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, color }),
      });
    } else if (categoryId) {
      await fetch("/api/menu/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, icon, color, categoryId }),
      });
    }
    onSaved();
  }

  return (
    <Modal open={open} onClose={onClose} title={subcategory ? "Editar subcategoria" : "Nova subcategoria"}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Nome</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-nord-panel border border-nord-border rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-nord-blue"
          />
        </div>
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Ícone</label>
          <IconPicker value={icon} onChange={setIcon} />
        </div>
        <div>
          <label className="block text-xs text-nord-gray mb-1.5">Cor</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <button
          onClick={submit}
          disabled={!name.trim()}
          className="w-full bg-nord-blue hover:bg-nord-blue-light disabled:opacity-50 text-white text-sm font-medium rounded-lg py-2.5"
        >
          Salvar
        </button>
      </div>
    </Modal>
  );
}
