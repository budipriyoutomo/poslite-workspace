"use client";

import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";

import { CategoriesTab } from "./CategoriesTab";
import { MenuImportDialog } from "./MenuImportDialog";
import { ModifierGroupsTab } from "./ModifierGroupsTab";
import { ProductsTab } from "./ProductsTab";

export function MenuScreen() {
  const [isImporting, setIsImporting] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Menu</h1>
        <Button variant="outline" onClick={() => setIsImporting(true)}>
          <FileSpreadsheet /> Import Excel
        </Button>
      </div>
      <MenuImportDialog open={isImporting} onOpenChange={setIsImporting} />
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
