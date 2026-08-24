import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import Header from "@/components/layout/header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFeatures } from "@/hooks/useFeatures";

interface Product {
  id: string;
  name: string;
  price: string;
  description?: string | null;
  active: boolean;
}
interface Order {
  id: string;
  contactPhone: string;
  contactName?: string | null;
  items: { name: string; qty: number; price: string }[];
  total: string;
  status: string;
  createdAt: string;
}

const STATUSES = ["new", "confirmed", "completed", "cancelled"];

export default function OrderingPage() {
  const { toast } = useToast();
  const features = useFeatures();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/ordering/products"],
    queryFn: () => apiRequest("GET", "/api/ordering/products").then((r) => r.json()),
  });
  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/ordering/orders"],
    queryFn: () => apiRequest("GET", "/api/ordering/orders").then((r) => r.json()),
  });

  const addProduct = useMutation({
    mutationFn: () => {
      if (!name.trim() || price === "" || Number.isNaN(Number(price)))
        throw new Error("Enter a name and a valid price");
      return apiRequest("POST", "/api/ordering/products", {
        name,
        price: Number(price),
        description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ordering/products"] });
      setName(""); setPrice(""); setDescription("");
      toast({ title: "Product added" });
    },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const delProduct = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/ordering/products/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ordering/products"] }),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PUT", `/api/ordering/orders/${id}/status`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ordering/orders"] }),
  });

  return (
    <div className="flex-1 dots-bg min-h-screen">
      <Header title="Ordering Bot" subtitle="Products & orders" />
      <div className="p-4 md:p-6 space-y-6 max-w-5xl">
        {!features.orderingBot && (
          <Card>
            <CardContent className="py-4 text-sm text-amber-700 bg-amber-50">
              The ordering bot is currently <b>disabled</b>. Turn it on in{" "}
              <Link href="/settings?tab=features" className="underline">
                Settings → Features
              </Link>{" "}
              for customers to place orders on WhatsApp. You can still set up
              products and view orders here.
            </CardContent>
          </Card>
        )}

        {/* Products */}
        <Card>
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Customers who message <b>order</b> or <b>menu</b> see this list.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[160px]">
                <Label htmlFor="pname">Name</Label>
                <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="w-32">
                <Label htmlFor="pprice">Price</Label>
                <Input id="pprice" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Label htmlFor="pdesc">Description</Label>
                <Input id="pdesc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <Button onClick={() => addProduct.mutate()} disabled={addProduct.isPending}>
                Add
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-sm text-gray-500">
                        No products yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-gray-600">{p.description}</TableCell>
                        <TableCell className="text-right">{Number(p.price).toFixed(2)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => delProduct.mutate(p.id)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Orders */}
        <Card>
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm text-gray-500">
                        No orders yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(o.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">
                          {o.contactName || o.contactPhone}
                          <div className="text-xs text-gray-500">{o.contactPhone}</div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {(o.items || []).map((it, i) => (
                            <div key={i}>{it.name} × {it.qty}</div>
                          ))}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {Number(o.total).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Select value={o.status} onValueChange={(v) => setStatus.mutate({ id: o.id, status: v })}>
                            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
