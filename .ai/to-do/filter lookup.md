Solusi 2: Attribute-Based Fast Match (Pencocokan Kode/Nama Wilayah)
Jika data titik bangunan memiliki atribut wilayah (seperti kolom kecamatan atau desa):

Gunakan pencocokan string atribut marker.kecamatan === filter.kecamatan ($O(1)$ instant lookup) daripada matematika Ray-Casting spasial.