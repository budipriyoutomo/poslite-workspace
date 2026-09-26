"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { CategoriesTab } from "./CategoriesTab";
import { ModifierGroupsTab } from "./ModifierGroupsTab";
import { ProductsTab } from "./ProductsTab";

export function MenuScreen() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Menu</h1>
      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Produk</TabsTrigger>
          <TabsTrigger value="categories">Kategori</TabsTrigger>
          <TabsTrigger value="modifiers">Pilihan</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="pt-3">
          <ProductsTab />
        </TabsContent>
        <TabsContent value="categories" className="pt-3">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="modifiers" className="pt-3">
          <ModifierGroupsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
