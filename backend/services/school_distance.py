"""
School Distance Service - Compute distance from projects to popular schools

Provides functions to:
1. Calculate haversine distance between two points
2. Check if any popular school is within 1km of a project
3. Batch compute school flags for all projects
"""
from typing import List, Tuple, Optional
from math import radians, sin, cos, sqrt, atan2
from datetime import datetime


# Distance threshold in meters
SCHOOL_DISTANCE_THRESHOLD_METERS = 1000


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the haversine distance between two points on Earth.

    Args:
        lat1, lng1: Coordinates of first point (in degrees)
        lat2, lng2: Coordinates of second point (in degrees)

    Returns:
        Distance in meters
    """
    R = 6371000  # Earth's radius in meters

    lat1, lng1, lat2, lng2 = map(radians, [lat1, lng1, lat2, lng2])

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlng/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))

    return R * c


def has_school_within_distance(
    project_lat: float,
    project_lng: float,
    school_coordinates: List[Tuple[float, float]],
    distance_threshold: float = SCHOOL_DISTANCE_THRESHOLD_METERS
) -> bool:
    """
    Check if any school is within the specified distance of a project.

    Args:
        project_lat: Project latitude
        project_lng: Project longitude
        school_coordinates: List of (latitude, longitude) tuples for schools
        distance_threshold: Maximum distance in meters (default 1000m = 1km)

    Returns:
        True if any school is within the threshold distance
    """
    if not project_lat or not project_lng:
        return False

    for school_lat, school_lng in school_coordinates:
        if school_lat and school_lng:
            distance = haversine(project_lat, project_lng, school_lat, school_lng)
            if distance <= distance_threshold:
                return True

    return False


def get_nearest_school_distance(
    project_lat: float,
    project_lng: float,
    school_data: List[Tuple[str, float, float]]
) -> Optional[Tuple[str, float]]:
    """
    Find the nearest school and its distance from a project.

    Args:
        project_lat: Project latitude
        project_lng: Project longitude
        school_data: List of (school_name, latitude, longitude) tuples

    Returns:
        Tuple of (school_name, distance_in_meters) for nearest school, or None
    """
    if not project_lat or not project_lng:
        return None

    nearest_school = None
    nearest_distance = float('inf')

    for school_name, school_lat, school_lng in school_data:
        if school_lat and school_lng:
            distance = haversine(project_lat, project_lng, school_lat, school_lng)
            if distance < nearest_distance:
                nearest_distance = distance
                nearest_school = school_name

    if nearest_school:
        return (nearest_school, nearest_distance)

    return None


def compute_school_flags_batch(app):
    """
    Compute has_popular_school_1km flag for all projects with coordinates.

    This function:
    1. Loads all popular schools with coordinates
    2. For each project with coordinates, checks if any school is within 1km
    3. Updates the has_popular_school_1km flag

    Args:
        app: Flask app context

    Returns:
        Dict with stats: {'updated': int, 'with_school': int, 'without_school': int, 'skipped': int}
    """
    from models.popular_school import PopularSchool
    from models.project_location import ProjectLocation
    from models.database import db

    stats = {
        'updated': 0,
        'with_school': 0,
        'without_school': 0,
        'skipped': 0
    }

    with app.app_context():
        # Load all school coordinates
        schools = db.session.query(
            PopularSchool.school_name,
            PopularSchool.latitude,
            PopularSchool.longitude
        ).filter(
            PopularSchool.latitude.isnot(None),
            PopularSchool.longitude.isnot(None)
        ).all()

        if not schools:
            print("No schools with coordinates found!")
            return stats

        school_coords = [
            (float(s.latitude), float(s.longitude))
            for s in schools
        ]
        school_data = [
            (s.school_name, float(s.latitude), float(s.longitude))
            for s in schools
        ]

        print(f"Loaded {len(school_coords)} schools with coordinates")

        # Get all projects with coordinates
        projects = db.session.query(ProjectLocation).filter(
            ProjectLocation.latitude.isnot(None),
            ProjectLocation.longitude.isnot(None),
            ProjectLocation.geocode_status == 'success'
        ).all()

        print(f"Processing {len(projects)} projects with coordinates...")

        for project in projects:
            try:
                project_lat = float(project.latitude)
                project_lng = float(project.longitude)

                has_school = has_school_within_distance(
                    project_lat, project_lng, school_coords
                )

                project.has_popular_school_1km = has_school
                stats['updated'] += 1

                if has_school:
                    stats['with_school'] += 1
                    nearest = get_nearest_school_distance(project_lat, project_lng, school_data)
                    if nearest:
                        print(f"  {project.project_name}: YES (nearest: {nearest[0]} at {nearest[1]:.0f}m)")
                else:
                    stats['without_school'] += 1

            except (ValueError, TypeError) as e:
                stats['skipped'] += 1
                print(f"  Error processing {project.project_name}: {e}")

        # Commit all changes
        db.session.commit()
        print(f"\nUpdated {stats['updated']} projects")
        print(f"  With popular school within 1km: {stats['with_school']}")
        print(f"  Without: {stats['without_school']}")
        print(f"  Skipped: {stats['skipped']}")

    return stats


def compute_school_flag_single(project_lat: float, project_lng: float, app) -> Optional[bool]:
    """
    Compute school flag for a single project.

    Args:
        project_lat: Project latitude
        project_lng: Project longitude
        app: Flask app context

    Returns:
        True if popular school within 1km, False otherwise, None if error
    """
    from models.popular_school import PopularSchool
    from models.database import db

    if not project_lat or not project_lng:
        return None

    with app.app_context():
        schools = db.session.query(
            PopularSchool.latitude,
            PopularSchool.longitude
        ).filter(
            PopularSchool.latitude.isnot(None),
            PopularSchool.longitude.isnot(None)
        ).all()

        if not schools:
            return None

        school_coords = [
            (float(s.latitude), float(s.longitude))
            for s in schools
        ]

        return has_school_within_distance(project_lat, project_lng, school_coords)


def update_new_project_school_flag(project_location, app) -> bool:
    """
    Update school flag for a newly geocoded project.

    Args:
        project_location: ProjectLocation model instance
        app: Flask app context

    Returns:
        The computed has_popular_school_1km value
    """
    if not project_location.latitude or not project_location.longitude:
        return None

    has_school = compute_school_flag_single(
        float(project_location.latitude),
        float(project_location.longitude),
        app
    )

    project_location.has_popular_school_1km = has_school
    return has_school
