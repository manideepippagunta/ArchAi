import bpy

def create_house():
    # Clear existing mesh objects
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.object.select_by_type(type='MESH')
    bpy.ops.object.delete()

    # Foundation
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.05))
    foundation = bpy.context.active_object
    foundation.scale = (10, 8, 0.1)
    foundation.name = "Foundation"

    # Main Floor
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-2, 0, 1.25))
    ground_floor = bpy.context.active_object
    ground_floor.scale = (5, 6, 2.5)
    ground_floor.name = "GroundFloor"

    # Glass Section
    bpy.ops.mesh.primitive_cube_add(size=1, location=(2, 1, 1.25))
    glass_section = bpy.context.active_object
    glass_section.scale = (4, 4, 2.5)
    glass_section.name = "GlassWing"

    # Second Floor
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.5, -1, 3.25))
    second_floor = bpy.context.active_object
    second_floor.scale = (6, 5, 1.5)
    second_floor.name = "SecondFloor"

    # Roof
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0.5, -1, 4.05))
    roof = bpy.context.active_object
    roof.scale = (6.2, 5.2, 0.1)
    roof.name = "Roof"

    # Columns
    for pos in [(4, 3, 1.25), (4, -1, 1.25)]:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.1, depth=2.5, location=pos)
        col = bpy.context.active_object
        col.name = "Column"

    # Pool
    bpy.ops.mesh.primitive_cube_add(size=1, location=(3, -3, 0.06))
    pool = bpy.context.active_object
    pool.scale = (3, 2, 0.02)
    pool.name = "WaterFeature"

if __name__ == "__main__":
    create_house()
